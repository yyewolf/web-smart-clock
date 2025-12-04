class SmartClock {
    constructor() {
        this.ws = null;
        this.peerConnection = null;
        this.audioStream = null;
        this.reconnectInterval = null;
        this.webrtcReconnectInterval = null;
        this.isWebRTCConnecting = false;
        this.currentTab = 0;
        this.tabs = ['clock', 'audio', 'settings', 'info'];
        this.timezone = 'UTC'; // Default timezone
        
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupSwipeGestures();
        this.setupBrightnessControl();
        this.fetchConfig(); // Fetch timezone configuration
        this.startLocalClock();
        this.connectWebSocket();
        this.checkSnapclientStatus();
        
        // Check snapclient status every 10 seconds
        setInterval(() => this.checkSnapclientStatus(), 10000);
        
        // Auto-start audio stream after a brief delay
        setTimeout(() => this.startAudioStream(), 1000);
    }

    startLocalClock() {
        const updateTime = () => {
            const now = new Date();
            
            // Format time as HH:MM:SS in the configured timezone
            const hours = String(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: this.timezone }).split(':')[0]).padStart(2, '0');
            const minutes = String(now.toLocaleString('en-US', { minute: '2-digit', timeZone: this.timezone })).padStart(2, '0');
            const seconds = String(now.toLocaleString('en-US', { second: '2-digit', timeZone: this.timezone })).padStart(2, '0');
            const timeString = `${hours}:${minutes}:${seconds}`;
            
            // Format date in the configured timezone
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: this.timezone };
            const dateString = now.toLocaleDateString('en-US', options);
            
            document.getElementById('time').textContent = timeString;
            document.getElementById('date').textContent = dateString;
        };
        
        // Update immediately
        updateTime();
        
        // Update every second
        setInterval(updateTime, 1000);
    }

    async fetchConfig() {
        try {
            const response = await fetch('/api/config');
            const data = await response.json();
            this.timezone = data.timezone || 'UTC';
            console.log('Timezone set to:', this.timezone);
        } catch (error) {
            console.error('Error fetching config:', error);
            this.timezone = 'UTC';
        }
    }

    setupTabs() {
        // No tab buttons to set up, just ensure swipe works
    }

    switchToTab(index) {
        const tabContents = document.querySelectorAll('.tab-content');
        const tabName = this.tabs[index];
        
        this.currentTab = index;
        
        // Remove active class from all contents
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Add active class to the selected content
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Send tab change to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'set-tab',
                tab: tabName
            }));
            console.log('Tab changed to:', tabName);
        }
    }

    setupSwipeGestures() {
        const container = document.querySelector('.container');
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        
        container.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            
            // Check if brightness is 0, if so set it to 1
            this.checkAndRestoreBrightness();
        }, { passive: true });
        
        container.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleSwipe(touchStartX, touchEndX, touchStartY, touchEndY);
        }, { passive: true });
    }
    
    checkAndRestoreBrightness() {
        // Get current brightness from slider
        const slider = document.getElementById('brightnessSlider');
        if (slider && parseInt(slider.value) === 0) {
            const brightness = 1;
            slider.value = brightness;
            
            const valueDisplay = document.getElementById('brightnessValue');
            if (valueDisplay) {
                valueDisplay.textContent = brightness + '%';
            }
            
            // Update device brightness
            if (window.WebviewKioskBrightnessInterface) {
                try {
                    const deviceBrightness = Math.round((brightness / 100) * 255);
                    window.WebviewKioskBrightnessInterface.setBrightness(deviceBrightness);
                    console.log('Restored brightness from 0 to:', deviceBrightness, '(', brightness, '%)');
                } catch (error) {
                    console.error('Error restoring device brightness:', error);
                }
            }
            
            // Send to server to sync across all clients
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'set-brightness',
                    brightness: brightness
                }));
            }
        }
    }

    handleSwipe(startX, endX, startY, endY) {
        const diffX = startX - endX;
        const diffY = startY - endY;
        const threshold = 50; // Minimum swipe distance
        
        // Check if horizontal swipe is more dominant than vertical
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
            if (diffX > 0) {
                // Swipe left - next tab
                const nextTab = (this.currentTab + 1) % this.tabs.length;
                this.switchToTab(nextTab);
            } else {
                // Swipe right - previous tab
                const prevTab = (this.currentTab - 1 + this.tabs.length) % this.tabs.length;
                this.switchToTab(prevTab);
            }
        }
    }

    setupBrightnessControl() {
        const slider = document.getElementById('brightnessSlider');
        const valueDisplay = document.getElementById('brightnessValue');
        
        // Fetch current brightness from server
        this.fetchBrightness();
        
        // Check if brightness interface is available
        if (window.WebviewKioskBrightnessInterface) {
            // Handle brightness changes
            slider.addEventListener('input', (e) => {
                const brightness = parseInt(e.target.value);
                valueDisplay.textContent = brightness + '%';
                
                try {
                    // Convert 0-100 to 0-255 for device interface
                    const deviceBrightness = Math.round((brightness / 100) * 255);
                    window.WebviewKioskBrightnessInterface.setBrightness(deviceBrightness);
                    console.log('Set device brightness to:', deviceBrightness, '(', brightness, '%)');
                } catch (error) {
                    console.error('Error setting device brightness:', error);
                }
                
                // Send to server to sync across all clients
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'set-brightness',
                        brightness: brightness
                    }));
                }
            });
        } else {
            // Brightness control not available, but still allow control via server
            slider.addEventListener('input', (e) => {
                const brightness = parseInt(e.target.value);
                valueDisplay.textContent = brightness + '%';
                
                // Send to server to sync across all clients
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'set-brightness',
                        brightness: brightness
                    }));
                }
            });
            console.warn('WebviewKioskBrightnessInterface not available');
        }
    }

    async fetchBrightness() {
        try {
            const response = await fetch('/api/brightness');
            const data = await response.json();
            const brightness = data.brightness;
            
            const slider = document.getElementById('brightnessSlider');
            const valueDisplay = document.getElementById('brightnessValue');
            
            if (slider && valueDisplay) {
                slider.value = brightness;
                valueDisplay.textContent = brightness + '%';
                
                // Also set device brightness if available
                if (window.WebviewKioskBrightnessInterface) {
                    try {
                        // Convert 0-100 to 0-255 for device interface
                        const deviceBrightness = Math.round((brightness / 100) * 255);
                        window.WebviewKioskBrightnessInterface.setBrightness(deviceBrightness);
                        console.log('Initialized device brightness to:', deviceBrightness, '(', brightness, '%)');
                    } catch (error) {
                        console.error('Error initializing device brightness:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching brightness:', error);
        }
    }

    sendCurrentBrightness() {
        const slider = document.getElementById('brightnessSlider');
        if (slider && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const brightness = parseInt(slider.value);
            this.ws.send(JSON.stringify({
                type: 'set-brightness',
                brightness: brightness
            }));
            console.log('Sent current brightness to server:', brightness);
        }
    }

    connectWebSocket() {
        // Close existing connection if any
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateStatus('wsStatus', 'Connected', true);
            this.updateStatusText('wsStatusText', 'Connected', true);
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
            
            // Send current brightness to server on connect/reconnect
            this.sendCurrentBrightness();
            
            // Restart audio stream when WebSocket reconnects
            if (!this.peerConnection || this.peerConnection.connectionState !== 'connected') {
                setTimeout(() => this.startAudioStream(), 500);
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle WebRTC signaling messages
                if (data.type === 'webrtc-answer') {
                    this.handleWebRTCAnswer(data.answer);
                } else if (data.type === 'ice-candidate') {
                    this.handleICECandidate(data.candidate);
                } else if (data.type === 'brightness-update') {
                    this.handleBrightnessUpdate(data.brightness);
                } else if (data.type === 'tab-update') {
                    this.handleTabUpdate(data.tab);
                }
                // Removed clock update handling - using local time now
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('wsStatus', 'Error', false);
            this.updateStatusText('wsStatusText', 'Error', false);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateStatus('wsStatus', 'Disconnected', false);
            this.updateStatusText('wsStatusText', 'Disconnected', false);
            
            // Try to reconnect every 5 seconds
            if (!this.reconnectInterval) {
                this.reconnectInterval = setInterval(() => {
                    console.log('Attempting to reconnect...');
                    this.connectWebSocket();
                }, 5000);
            }
        };
    }

    updateStatus(elementId, text, isPositive) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.classList.remove('connected', 'disconnected', 'active');
        
        if (isPositive) {
            element.classList.add('connected');
        } else if (text === 'Disconnected' || text === 'Error' || text === 'Inactive') {
            element.classList.add('disconnected');
        }
    }

    updateStatusText(elementId, text, isPositive) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = text;
        element.classList.remove('connected', 'disconnected', 'active');
        
        if (isPositive) {
            element.classList.add('connected');
        } else if (text === 'Disconnected' || text === 'Error' || text === 'Inactive') {
            element.classList.add('disconnected');
        }
    }

    async checkSnapclientStatus() {
        try {
            const response = await fetch('/api/snap/status');
            const data = await response.json();
            
            this.updateStatus(
                'snapStatus',
                data.running ? 'Running' : 'Stopped',
                data.running
            );
        } catch (error) {
            console.error('Error checking snapclient status:', error);
            this.updateStatus('snapStatus', 'Unknown', false);
        }
    }

    async startAudioStream() {
        // Prevent multiple simultaneous connection attempts
        if (this.isWebRTCConnecting) {
            console.log('WebRTC connection already in progress, skipping...');
            return;
        }
        
        // Check if already connected
        if (this.peerConnection && this.peerConnection.connectionState === 'connected') {
            console.log('WebRTC already connected, skipping...');
            return;
        }
        
        // Don't start if WebSocket is not connected
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket not ready, deferring audio stream start');
            return;
        }
        
        try {
            console.log('Starting audio stream...');
            this.isWebRTCConnecting = true;
            
            // Close existing peer connection if any
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            // Create RTCPeerConnection
            const configuration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            };
            
            this.peerConnection = new RTCPeerConnection(configuration);
            
            // Handle incoming audio tracks
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind, event.track.id);
                console.log('Streams:', event.streams.length);
                const audioPlayer = document.getElementById('audioPlayer');
                audioPlayer.srcObject = event.streams[0];
                audioPlayer.volume = 1.0;
                audioPlayer.play()
                    .then(() => console.log('Audio playback started'))
                    .catch(e => console.error('Error playing audio:', e));
                this.updateStatus('audioStatus', 'Playing', true);
                this.updateStatusText('audioStatusText', 'Playing', true);
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: event.candidate
                    }));
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', this.peerConnection.connectionState);
                if (this.peerConnection.connectionState === 'connected') {
                    this.updateStatus('audioStatus', 'Connected', true);
                    this.updateStatusText('audioStatusText', 'Connected', true);
                    this.isWebRTCConnecting = false;
                    if (this.webrtcReconnectInterval) {
                        clearInterval(this.webrtcReconnectInterval);
                        this.webrtcReconnectInterval = null;
                    }
                } else if (this.peerConnection.connectionState === 'failed') {
                    console.log('WebRTC connection failed, attempting to reconnect...');
                    this.updateStatus('audioStatus', 'Failed', false);
                    this.updateStatusText('audioStatusText', 'Failed', false);
                    this.isWebRTCConnecting = false;
                    this.scheduleWebRTCReconnect();
                } else if (this.peerConnection.connectionState === 'disconnected') {
                    console.log('WebRTC disconnected, attempting to reconnect...');
                    this.updateStatus('audioStatus', 'Disconnected', false);
                    this.updateStatusText('audioStatusText', 'Disconnected', false);
                    this.isWebRTCConnecting = false;
                    this.scheduleWebRTCReconnect();
                }
            };

            // Handle ICE connection state
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            };

            // Handle ICE gathering state
            this.peerConnection.onicegatheringstatechange = () => {
                console.log('ICE gathering state:', this.peerConnection.iceGatheringState);
            };

            // Create offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            
            await this.peerConnection.setLocalDescription(offer);
            
            // Send offer to server
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'webrtc-offer',
                    offer: offer
                }));
            }

            this.updateStatus('audioStatus', 'Connecting...', false);
            this.updateStatusText('audioStatusText', 'Connecting...', false);
            
        } catch (error) {
            console.error('Error starting audio stream:', error);
            this.updateStatus('audioStatus', 'Error', false);
            this.updateStatusText('audioStatusText', 'Error', false);
            this.isWebRTCConnecting = false;
            this.scheduleWebRTCReconnect();
        }
    }

    scheduleWebRTCReconnect() {
        if (this.webrtcReconnectInterval) {
            return; // Already scheduled
        }
        
        console.log('Scheduling WebRTC reconnection in 3 seconds...');
        this.webrtcReconnectInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log('Attempting WebRTC reconnection...');
                this.startAudioStream();
            }
        }, 3000);
    }

    stopAudioStream() {
        console.log('Stopping audio stream...');
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        const audioPlayer = document.getElementById('audioPlayer');
        if (audioPlayer) {
            audioPlayer.srcObject = null;
            audioPlayer.pause();
        }

        this.updateStatus('audioStatus', 'Inactive', false);
        this.updateStatusText('audioStatusText', 'Inactive', false);
    }

    async handleWebRTCAnswer(answer) {
        try {
            console.log('Received WebRTC answer:', answer);
            if (!this.peerConnection) {
                console.error('No peer connection available for answer');
                return;
            }
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Remote description set successfully');
            console.log('Remote tracks:', this.peerConnection.getReceivers().length);
        } catch (error) {
            console.error('Error handling WebRTC answer:', error);
            this.updateStatus('audioStatus', 'Error', false);
        }
    }

    async handleICECandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added ICE candidate');
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    cleanup() {
        console.log('Cleaning up SmartClock instance...');
        
        // Clear all intervals
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.webrtcReconnectInterval) {
            clearInterval(this.webrtcReconnectInterval);
            this.webrtcReconnectInterval = null;
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        console.log('SmartClock cleanup complete');
    }

    handleBrightnessUpdate(brightness) {
        console.log('Received brightness update:', brightness);
        const slider = document.getElementById('brightnessSlider');
        const valueDisplay = document.getElementById('brightnessValue');
        
        if (slider && valueDisplay) {
            slider.value = brightness;
            valueDisplay.textContent = brightness + '%';
            
            // Update device brightness if available
            if (window.WebviewKioskBrightnessInterface) {
                try {
                    // Convert 0-100 to 0-255 for device interface
                    const deviceBrightness = Math.round((brightness / 100) * 255);
                    window.WebviewKioskBrightnessInterface.setBrightness(deviceBrightness);
                    console.log('Updated device brightness to:', deviceBrightness, '(', brightness, '%)');
                } catch (error) {
                    console.error('Error updating device brightness:', error);
                }
            }
        }
    }

    handleTabUpdate(tab) {
        console.log('Received tab update:', tab);
        const tabIndex = this.tabs.indexOf(tab);
        if (tabIndex !== -1 && tabIndex !== this.currentTab) {
            this.switchToTab(tabIndex);
        }
    }
}

// Initialize the smart clock when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Clean up existing instance if any
    if (window.smartClock) {
        window.smartClock.cleanup();
    }
    
    window.smartClock = new SmartClock();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.smartClock) {
            window.smartClock.cleanup();
        }
    });
});
