package main

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	opus "gopkg.in/hraban/opus.v2"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	conn           *websocket.Conn
	send           chan []byte
	peerConnection *webrtc.PeerConnection
	audioTrack     *webrtc.TrackLocalStaticSample
	stopAudio      chan struct{} // Signal to stop audio streaming
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.RWMutex
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
			log.Println("Client registered")

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mutex.Unlock()
			log.Println("Client unregistered")

		case message := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mutex.RUnlock()
		}
	}
}

type ClockData struct {
	Time      string `json:"time"`
	Date      string `json:"date"`
	Timestamp int64  `json:"timestamp"`
}

type WebRTCMessage struct {
	Type      string                     `json:"type"`
	Offer     *webrtc.SessionDescription `json:"offer,omitempty"`
	Answer    *webrtc.SessionDescription `json:"answer,omitempty"`
	Candidate *webrtc.ICECandidateInit   `json:"candidate,omitempty"`
}

type BrightnessMessage struct {
	Type       string `json:"type"`
	Brightness int    `json:"brightness,omitempty"`
}

type BrightnessState struct {
	value int
	mutex sync.RWMutex
}

var brightnessState = &BrightnessState{
	value: 128, // Default brightness
}

// AudioMultiplexer manages audio distribution to multiple clients
type AudioMultiplexer struct {
	listeners      map[chan []byte]bool
	listenersMutex sync.RWMutex
	sourceChannel  chan []byte
}

func newAudioMultiplexer() *AudioMultiplexer {
	return &AudioMultiplexer{
		listeners:     make(map[chan []byte]bool),
		sourceChannel: make(chan []byte, 100),
	}
}

func (am *AudioMultiplexer) start() {
	go func() {
		log.Println("Audio multiplexer started")
		for frame := range am.sourceChannel {
			am.listenersMutex.RLock()
			for ch := range am.listeners {
				select {
				case ch <- frame:
					// Successfully sent
				default:
					// Channel full, skip this listener for this frame
				}
			}
			am.listenersMutex.RUnlock()
		}
	}()
}

func (am *AudioMultiplexer) subscribe() chan []byte {
	ch := make(chan []byte, 50)
	am.listenersMutex.Lock()
	am.listeners[ch] = true
	am.listenersMutex.Unlock()
	log.Printf("Client subscribed to audio multiplexer (%d active)", len(am.listeners))
	return ch
}

func (am *AudioMultiplexer) unsubscribe(ch chan []byte) {
	am.listenersMutex.Lock()
	delete(am.listeners, ch)
	close(ch)
	am.listenersMutex.Unlock()
	log.Printf("Client unsubscribed from audio multiplexer (%d active)", len(am.listeners))
}

func (am *AudioMultiplexer) broadcast(frame []byte) {
	select {
	case am.sourceChannel <- frame:
		// Successfully queued
	default:
		// Source channel full, drop frame
	}
}

var (
	audioCmd         *exec.Cmd
	audioCmdMutex    sync.Mutex
	audioMultiplexer *AudioMultiplexer
)

func init() {
	// Initialize audio multiplexer
	audioMultiplexer = newAudioMultiplexer()
	audioMultiplexer.start()
}

func handleWebSocket(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		conn:      conn,
		send:      make(chan []byte, 256),
		stopAudio: make(chan struct{}),
	}
	hub.register <- client

	go writePump(client)
	go readPump(hub, client)
}

func readPump(hub *Hub, client *Client) {
	defer func() {
		hub.unregister <- client
		
		// Stop audio streaming goroutine
		close(client.stopAudio)
		
		// Close peer connection
		if client.peerConnection != nil {
			client.peerConnection.Close()
		}
		
		client.conn.Close()
	}()

	for {
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Handle WebRTC signaling messages
		var msg WebRTCMessage
		if err := json.Unmarshal(message, &msg); err == nil {
			handleWebRTCMessage(client, &msg)
		} else {
			// Try to handle brightness message
			var brightnessMsg BrightnessMessage
			if err := json.Unmarshal(message, &brightnessMsg); err == nil {
				handleBrightnessMessage(hub, &brightnessMsg)
			} else {
				// Broadcast other messages
				hub.broadcast <- message
			}
		}
	}
}

func writePump(client *Client) {
	defer client.conn.Close()

	for message := range client.send {
		if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Println("Write error:", err)
			return
		}
	}
}

func broadcastTime(hub *Hub) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		clockData := ClockData{
			Time:      now.Format("15:04:05"),
			Date:      now.Format("Monday, January 2, 2006"),
			Timestamp: now.Unix(),
		}

		data, err := json.Marshal(clockData)
		if err != nil {
			log.Println("JSON marshal error:", err)
			continue
		}

		hub.broadcast <- data
	}
}

func getSnapclientStatus() (map[string]interface{}, error) {
	// Check if snapclient is running
	cmd := exec.Command("pgrep", "-x", "snapclient")
	err := cmd.Run()
	
	status := map[string]interface{}{
		"running": err == nil,
		"message": "Snapclient not running",
	}
	
	if err == nil {
		status["message"] = "Snapclient is running"
	}
	
	return status, nil
}

func handleSnapStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	status, _ := getSnapclientStatus()
	json.NewEncoder(w).Encode(status)
}

func handleWebRTCMessage(client *Client, msg *WebRTCMessage) {
	switch msg.Type {
	case "webrtc-offer":
		handleWebRTCOffer(client, msg.Offer)
	case "ice-candidate":
		handleICECandidate(client, msg.Candidate)
	}
}

func handleWebRTCOffer(client *Client, offer *webrtc.SessionDescription) {
	log.Println("Received WebRTC offer")

	// Create WebRTC configuration
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{"stun:stun.l.google.com:19302"},
			},
		},
	}

	// Create peer connection
	peerConnection, err := webrtc.NewPeerConnection(config)
	if err != nil {
		log.Printf("Failed to create peer connection: %v", err)
		return
	}

	client.peerConnection = peerConnection

	// Set remote description FIRST
	if err := peerConnection.SetRemoteDescription(*offer); err != nil {
		log.Printf("Failed to set remote description: %v", err)
		return
	}

	// Create audio track with Opus - best quality and timing for WebRTC
	audioTrack, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus},
		"audio",
		"smartclock-stream",
	)
	if err != nil {
		log.Printf("Failed to create audio track: %v", err)
		return
	}

	client.audioTrack = audioTrack

	// Add track to peer connection
	rtpSender, err := peerConnection.AddTrack(audioTrack)
	if err != nil {
		log.Printf("Failed to add track: %v", err)
		return
	}

	log.Printf("Added audio track to peer connection")

	// Read RTP packets (required but we don't use them)
	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	// Handle ICE candidates
	peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}

		candidateInit := candidate.ToJSON()
		candidateJSON, err := json.Marshal(WebRTCMessage{
			Type:      "ice-candidate",
			Candidate: &candidateInit,
		})
		if err != nil {
			log.Printf("Failed to marshal ICE candidate: %v", err)
			return
		}

		client.send <- candidateJSON
	})

	// Handle connection state changes
	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("Peer connection state: %s", state.String())
		if state == webrtc.PeerConnectionStateConnected {
			log.Println("WebRTC connection established, starting audio stream")
			go streamAudioToTrack(client.audioTrack, client.stopAudio)
		} else if state == webrtc.PeerConnectionStateDisconnected || state == webrtc.PeerConnectionStateFailed {
			log.Println("WebRTC connection lost")
		}
	})

	// Create answer
	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		log.Printf("Failed to create answer: %v", err)
		return
	}

	// Set local description
	if err := peerConnection.SetLocalDescription(answer); err != nil {
		log.Printf("Failed to set local description: %v", err)
		return
	}

	// Send answer back to client
	answerJSON, err := json.Marshal(WebRTCMessage{
		Type:   "webrtc-answer",
		Answer: &answer,
	})
	if err != nil {
		log.Printf("Failed to marshal answer: %v", err)
		return
	}

	client.send <- answerJSON
	log.Println("Sent WebRTC answer")
}

func handleICECandidate(client *Client, candidate *webrtc.ICECandidateInit) {
	if client.peerConnection == nil {
		log.Println("No peer connection for ICE candidate")
		return
	}

	if err := client.peerConnection.AddICECandidate(*candidate); err != nil {
		log.Printf("Failed to add ICE candidate: %v", err)
	}
}

func ensureAudioCapture() error {
	audioCmdMutex.Lock()
	defer audioCmdMutex.Unlock()
	
	// Check if audio capture is already running
	if audioCmd != nil && audioCmd.Process != nil {
		log.Println("Audio capture process already running")
		return nil
	}
	
	// Start new audio capture process
	log.Println("Starting persistent audio capture process...")
	cmd := exec.Command("parec",
		"--format=s16le",
		"--rate=48000",
		"--channels=2",
		"--latency-msec=10",
		"--process-time-msec=10",
		"--device=snapcast_sink.monitor",
	)
	
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	
	if err := cmd.Start(); err != nil {
		return err
	}
	
	audioCmd = cmd
	
	// Start background goroutine to continuously read and buffer audio
	go drainAudioPipe(stdout)
	
	log.Println("Persistent audio capture started with background drainer")
	return nil
}

// drainAudioPipe continuously reads from the audio pipe and broadcasts to all listeners
func drainAudioPipe(reader io.Reader) {
	const pcmFrameSize = 3840 // 20ms at 48kHz stereo
	bufReader := bufio.NewReaderSize(reader, pcmFrameSize*2)
	
	log.Println("Background audio drainer started")
	
	for {
		buffer := make([]byte, pcmFrameSize)
		n, err := io.ReadFull(bufReader, buffer)
		if err != nil {
			if err != io.EOF {
				log.Printf("Audio pipe read error: %v", err)
			}
			log.Println("Audio pipe closed, drainer exiting")
			return
		}
		
		if n == pcmFrameSize {
			// Broadcast to all subscribers via multiplexer
			audioMultiplexer.broadcast(buffer)
		}
	}
}

func streamAudioToTrack(track *webrtc.TrackLocalStaticSample, stopAudio <-chan struct{}) {
	// Ensure the shared audio capture process is running
	if err := ensureAudioCapture(); err != nil {
		log.Printf("Failed to start audio capture: %v", err)
		return
	}

	log.Println("Client connected to audio stream")

	// Subscribe to the audio multiplexer
	audioChannel := audioMultiplexer.subscribe()
	defer audioMultiplexer.unsubscribe(audioChannel)

	defer func() {
		log.Println("Client disconnected from audio stream")
	}()
	
	// Stop if client disconnects
	done := make(chan struct{})
	go func() {
		<-stopAudio
		log.Println("Stopping audio stream for this client")
		close(done)
	}()

	// Create Opus encoder with optimal settings for low latency
	const sampleRate = 48000
	const channels = 2
	const frameDuration = 20 * time.Millisecond
	
	enc, err := opus.NewEncoder(sampleRate, channels, opus.AppAudio)
	if err != nil {
		log.Printf("Failed to create Opus encoder: %v", err)
		return
	}
	
	// Set low latency and high quality
	enc.SetBitrate(128000)
	enc.SetComplexity(5) // Balance between quality and speed

	// PCM frame size: 20ms at 48kHz stereo = 960 samples * 2 channels * 2 bytes = 3840 bytes
	const pcmFrameSize = 3840
	pcmBuffer := make([]int16, pcmFrameSize/2) // int16 samples
	opusBuffer := make([]byte, 4000)           // Opus output buffer
	
	log.Printf("Starting Opus encoding (48kHz stereo @ 20ms frames)")
	
	sampleCount := 0
	startTime := time.Now()
	consecutiveSilentFrames := 0
	const silenceThreshold = int16(100)    // Amplitude threshold for silence detection
	const maxSilentFrames = 25             // 25 frames = 500ms of silence before stopping
	streamingActive := true
	
	for {
		select {
		case <-done:
			// Client disconnected, exit this goroutine
			return
		case rawBuffer := <-audioChannel:
			// Convert bytes to int16 samples and check for silence
			isSilent := true
			for i := 0; i < len(pcmBuffer); i++ {
				sample := int16(rawBuffer[i*2]) | int16(rawBuffer[i*2+1])<<8
				pcmBuffer[i] = sample
				
				// Check if sample exceeds silence threshold
				if sample > silenceThreshold || sample < -silenceThreshold {
					isSilent = false
				}
			}
			
			// Track consecutive silent frames
			if isSilent {
				consecutiveSilentFrames++
				if consecutiveSilentFrames == maxSilentFrames && streamingActive {
					log.Println("Silence detected, pausing stream")
					streamingActive = false
				}
			} else {
				if consecutiveSilentFrames >= maxSilentFrames && !streamingActive {
					log.Println("Audio detected, resuming stream")
					streamingActive = true
				}
				consecutiveSilentFrames = 0
			}
			
			// Only encode and send if streaming is active
			if !streamingActive {
				continue
			}
			
			// Encode to Opus
			opusLen, err := enc.Encode(pcmBuffer, opusBuffer)
			if err != nil {
				log.Printf("Opus encoding error: %v", err)
				continue
			}
			
			// Send encoded Opus data
			if err := track.WriteSample(media.Sample{
				Data:     opusBuffer[:opusLen],
				Duration: frameDuration,
			}); err != nil {
				log.Printf("Failed to write sample: %v", err)
				return
			}
			
			sampleCount++
			if sampleCount%50 == 0 {
				elapsed := time.Since(startTime).Seconds()
				packetsPerSec := float64(sampleCount) / elapsed
				log.Printf("Streamed %d Opus packets (%.1f pkt/s, %d bytes)", sampleCount, packetsPerSec, opusLen)
			}
		}
	}
}

func handleBrightnessMessage(hub *Hub, msg *BrightnessMessage) {
	switch msg.Type {
	case "set-brightness":
		brightnessState.mutex.Lock()
		brightnessState.value = msg.Brightness
		brightnessState.mutex.Unlock()
		log.Printf("Brightness set to %d", msg.Brightness)
		
		// Broadcast brightness update to all clients
		broadcastBrightness(hub, msg.Brightness)
	case "get-brightness":
		brightnessState.mutex.RLock()
		brightness := brightnessState.value
		brightnessState.mutex.RUnlock()
		
		// Send brightness to requesting client (broadcast to all for simplicity)
		broadcastBrightness(hub, brightness)
	}
}

func broadcastBrightness(hub *Hub, brightness int) {
	msg := BrightnessMessage{
		Type:       "brightness-update",
		Brightness: brightness,
	}
	
	data, err := json.Marshal(msg)
	if err != nil {
		log.Println("Error marshaling brightness message:", err)
		return
	}
	
	hub.broadcast <- data
}

func handleGetBrightness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	brightnessState.mutex.RLock()
	brightness := brightnessState.value
	brightnessState.mutex.RUnlock()
	
	response := map[string]int{"brightness": brightness}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleSetBrightness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var req struct {
		Brightness int `json:"brightness"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	if req.Brightness < 0 || req.Brightness > 255 {
		http.Error(w, "Brightness must be between 0 and 255", http.StatusBadRequest)
		return
	}
	
	brightnessState.mutex.Lock()
	brightnessState.value = req.Brightness
	brightnessState.mutex.Unlock()
	
	log.Printf("Brightness set to %d via HTTP", req.Brightness)
	
	response := map[string]int{"brightness": req.Brightness}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	hub := newHub()
	go hub.run()
	go broadcastTime(hub)

	// Serve static files
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// WebSocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleWebSocket(hub, w, r)
	})

	// Snapclient status endpoint
	http.HandleFunc("/api/snap/status", handleSnapStatus)

	// Brightness endpoints
	http.HandleFunc("/api/brightness", handleGetBrightness)
	http.HandleFunc("/api/brightness/set", handleSetBrightness)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Smart Clock server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal("ListenAndServe error:", err)
	}
}
