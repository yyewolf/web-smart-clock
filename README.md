# Smart Clock System

A Go-based smart clock web application with real-time audio streaming via WebRTC and Snapcast integration. Designed for 800x480 touchscreen displays with swipeable interface and brightness control.

## Features

- 🕐 **Real-time Clock Display** - Client-side clock with live updating time and date
- 🔊 **High-Quality Audio Streaming** - WebRTC-based streaming with Opus codec (48kHz stereo @ 128kbps)
- 📱 **Touch-Optimized UI** - Swipeable 800x480 interface with gesture navigation
- 💡 **Brightness Control** - Integrated device brightness control with multi-client sync
- 🏠 **Home Assistant Integration** - HACS custom component with light entity and sensors
- 🎵 **Snapcast Integration** - Built-in Snapcast client for multi-room audio synchronization
- 🔄 **Auto-Reconnection** - Resilient WebSocket and WebRTC connections with automatic recovery
- 🎯 **Low Latency** - <35ms end-to-end audio latency with optimized buffering
- 🔇 **Silence Detection** - Automatic bandwidth saving when no audio is playing
- 🐳 **Docker Support** - Fully containerized with multi-stage Alpine build

## Architecture

The application consists of:

- **Go Backend** (`main.go`): HTTP/WebSocket server with WebRTC signaling, audio multiplexing, and brightness API
- **Web Frontend** (`static/`): Touch-optimized HTML/CSS/JavaScript UI (800x480 fixed layout)
- **Audio Pipeline**: PulseAudio parec → AudioMultiplexer → Opus encoding → WebRTC tracks
- **Home Assistant Integration**: Custom HACS component for smart home control
- **Brightness System**: WebviewKioskBrightnessInterface + server-side state sync

## Prerequisites

### Running with Docker (Recommended)
- Docker
- Docker Compose
- PulseAudio server (for audio streaming)

### Running Locally
- Go 1.21 or higher
- Opus library (`libopus-dev` or `opus-devel`)
- PulseAudio with `parec` command
- Snapcast client (optional, for multi-room sync)
- CGO enabled for Opus bindings

### For Home Assistant Integration
- Home Assistant 2023.1 or higher
- HACS (Home Assistant Community Store)

## Quick Start

### Using Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd test-clock
```

2. Start the services:
```bash
docker-compose up -d
```

3. Access the web interface:
```
http://localhost:8080
```

### Using Docker Only

1. Build the image:
```bash
docker build -t smartclock .
```

2. Run the container:
```bash
docker run -p 8080:8080 smartclock
```

### Running Locally

1. Install dependencies:
```bash
go mod download
```

2. Run the application:
```bash
go run main.go
```

3. Access the web interface:
```
http://localhost:8080
```

## Configuration

### Environment Variables

- `PORT` - HTTP server port (default: 8080)
- `SNAPSERVER_HOST` - Snapcast server hostname (default: snapserver)
- `SNAPSERVER_PORT` - Snapcast server port (default: 1704)
- `PULSE_SERVER` - PulseAudio server address (default: unix:/run/pulse/native)

### Docker Compose Configuration

Edit `docker-compose.yml` to customize:
- Port mappings
- Snapcast server configuration
- PulseAudio socket mounts
- Volume mounts

### Display Configuration

The UI is optimized for **800x480 touchscreen displays**. To run on a different resolution, modify:
- `static/styles.css`: Update `.container` width/height
- `static/index.html`: Update viewport meta tag

## Project Structure

```
test-clock/
├── main.go                      # Go backend server
├── go.mod                       # Go module dependencies
├── go.sum                       # Go module checksums
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Docker Compose setup
├── hacs.json                    # HACS repository metadata
├── README.md                    # This file
├── static/                      # Web frontend files
│   ├── index.html              # Main HTML page (800x480)
│   ├── styles.css              # Touch-optimized styling
│   └── app.js                  # JavaScript application (WebRTC, WebSocket, touch gestures)
├── custom_components/           # Home Assistant integration
│   └── smart_clock/            # HACS custom component
│       ├── __init__.py         # Integration setup
│       ├── manifest.json       # Component metadata
│       ├── config_flow.py      # UI configuration flow
│       ├── const.py            # Constants
│       ├── light.py            # Brightness light entity
│       ├── sensor.py           # Status sensors
│       └── strings.json        # Localization strings
└── woodpecker/                  # CI/CD configuration
    └── publish-docker.yaml     # Docker build pipeline
```

## API Endpoints

### HTTP Endpoints

- `GET /` - Serves the web interface
- `GET /api/snap/status` - Returns Snapclient status (running/stopped)
- `GET /api/brightness` - Returns current brightness (0-100)
- `POST /api/brightness/set` - Sets brightness (0-100), broadcasts to all clients

### WebSocket Endpoint

- `WS /ws` - WebSocket connection for real-time communication

## WebSocket Message Format

### Client → Server (WebRTC Signaling)
```json
{
  "type": "webrtc-offer",
  "offer": { "type": "offer", "sdp": "..." }
}
```

```json
{
  "type": "ice-candidate",
  "candidate": { "candidate": "...", "sdpMLineIndex": 0 }
}
```

### Server → Client (WebRTC Signaling)
```json
{
  "type": "webrtc-answer",
  "answer": { "type": "answer", "sdp": "..." }
}
```

```json
{
  "type": "ice-candidate",
  "candidate": { "candidate": "...", "sdpMLineIndex": 0 }
}
```

### Brightness Control
```json
{
  "type": "set-brightness",
  "brightness": 50
}
```

```json
{
  "type": "brightness-update",
  "brightness": 50
}
```

## Audio Streaming

### WebRTC Audio Pipeline

The application streams audio from PulseAudio to web browsers using an optimized pipeline:

1. **Audio Capture**: `parec` continuously captures audio from default PulseAudio sink monitor
2. **Multiplexing**: `AudioMultiplexer` distributes audio to multiple WebRTC clients simultaneously
3. **Encoding**: Native Opus encoding (48kHz stereo @ 128kbps, 20ms frames, complexity=5)
4. **Streaming**: WebRTC tracks with ICE/STUN for NAT traversal
5. **Silence Detection**: Automatically pauses streaming after 500ms of silence

**Performance**:
- End-to-end latency: <35ms
- Packet rate: 50 packets/second
- Audio format: Opus 48kHz stereo @ 128kbps
- Multi-client support with persistent audio capture

### Snapcast Integration

Optional multi-room audio synchronization:
- Connect to Snapcast server for synchronized playback across devices
- Status monitoring via `/api/snap/status` endpoint
- Controlled via environment variables (`SNAPSERVER_HOST`, `SNAPSERVER_PORT`)

## Home Assistant Integration

### Installation via HACS

1. Add this repository to HACS as a custom repository:
   - Repository: `https://github.com/yyewolf/web-smart-clock`
   - Category: Integration

2. Install "Smart Clock" from HACS

3. Restart Home Assistant

4. Add integration via UI:
   - Settings → Devices & Services → Add Integration
   - Search for "Smart Clock"
   - Enter your Smart Clock URL (e.g., `http://192.168.1.100:8080`)

### Entities

The integration provides:

- **Light Entity** (`light.smart_clock_display`):
  - Control brightness (0-100%)
  - Turn on/off (brightness 0 = off)
  - Syncs across all connected clients

- **Sensors**:
  - `sensor.smart_clock_snapclient`: Snapclient status (Running/Stopped)
  - `sensor.smart_clock_audio_stream`: Audio stream status (Active/Inactive)

### Example Automations

```yaml
# Auto-dim at night
automation:
  - alias: "Smart Clock - Dim at Night"
    trigger:
      - platform: time
        at: "22:00:00"
    action:
      - service: light.turn_on
        target:
          entity_id: light.smart_clock_display
        data:
          brightness_pct: 10

# Wake up with brightness
automation:
  - alias: "Smart Clock - Morning Brightness"
    trigger:
      - platform: time
        at: "07:00:00"
    action:
      - service: light.turn_on
        target:
          entity_id: light.smart_clock_display
        data:
          brightness_pct: 80
```

## UI Features

### Touch Gestures

- **Swipe Left**: Next tab
- **Swipe Right**: Previous tab
- **Touch (when brightness = 0)**: Automatically restore brightness to 1%

### Tabs

1. **Clock**: Large time/date display with status indicators
2. **Audio**: Stream controls and status monitoring
3. **Settings**: Brightness slider (0-100%)
4. **Info**: Weather and calendar widgets (placeholder)

### Auto-Reconnection

- WebSocket reconnects every 5 seconds on disconnect
- WebRTC reconnects every 3 seconds on failure
- Automatic cleanup of stale connections
- No manual intervention required

## Development

### Building

```bash
# Local build (requires CGO and Opus library)
CGO_ENABLED=1 go build -o smartclock .

# Docker build
docker build -t smartclock .
```

### Testing

```bash
go test ./...
```

### Adding Features

The modular architecture makes it easy to extend:

- **WebSocket handlers**: Add message types in `handleBrightnessMessage()` or create new handlers
- **HTTP endpoints**: Register new routes in `main()` function
- **UI components**: Extend tabs in `static/index.html` and `static/app.js`
- **Home Assistant entities**: Add new platforms in `custom_components/smart_clock/`

### Code Structure

**Backend (`main.go`)**:
- `Hub`: WebSocket client management and broadcasting
- `AudioMultiplexer`: Multi-client audio distribution
- `BrightnessState`: Thread-safe brightness state management
- `streamAudioToTrack()`: WebRTC audio streaming per client
- `handleBrightnessMessage()`: WebSocket brightness commands

**Frontend (`static/app.js`)**:
- `SmartClock` class: Main application controller
- WebRTC connection management with reconnection logic
- Touch gesture detection and tab navigation
- Brightness control with device interface integration

## Troubleshooting

### Audio Issues

**No audio in browser**:
- Check browser console for WebRTC errors
- Verify PulseAudio is running: `pactl info`
- Ensure default sink monitor exists: `pactl list short sources`
- Check if `parec` command works: `parec --list-devices`
- Review server logs for Opus encoding errors

**Audio stuttering or choppy**:
- Check network latency between server and client
- Verify CPU usage (Opus encoding is CPU-intensive)
- Ensure sufficient bandwidth for 128kbps stream
- Review silence detection threshold in `main.go`

**Multi-client audio issues**:
- AudioMultiplexer should handle multiple clients automatically
- Check server logs for "drainer goroutine" messages
- Verify all clients receive broadcast messages

### Connection Issues

**WebSocket disconnects frequently**:
- Check network stability
- Verify firewall allows WebSocket connections
- Review reconnection logic in browser console
- Ensure server isn't restarting (check Docker logs)

**WebRTC connection fails**:
- Verify STUN server accessibility (`stun.l.google.com:19302`)
- Check NAT/firewall configuration
- Review ICE candidate exchange in browser console
- Ensure proper WebRTC signaling via WebSocket

### Brightness Control

**Brightness not syncing**:
- Verify WebSocket connection is active
- Check `globalHub` is set in server logs
- Ensure `WebviewKioskBrightnessInterface` is available (Android WebView)
- Review brightness-update messages in browser console

**Home Assistant brightness not working**:
- Verify Smart Clock URL is accessible from Home Assistant
- Check `/api/brightness` endpoint returns valid JSON
- Review Home Assistant logs for HTTP errors
- Ensure integration is properly configured

### Snapclient Issues

**Snapclient not connecting**:
- Verify `SNAPSERVER_HOST` and `SNAPSERVER_PORT` environment variables
- Check if Snapcast server is running
- Review container logs: `docker-compose logs smartclock`
- Ensure network connectivity between containers

### Display Issues

**UI doesn't fit screen**:
- Verify display resolution is 800x480
- Check viewport meta tag in `index.html`
- Adjust `.container` dimensions in `styles.css`
- Ensure browser is in fullscreen/kiosk mode

**Touch gestures not working**:
- Verify touch events are registered (check browser console)
- Ensure swipe threshold (50px) is appropriate for your screen
- Check if touch events are blocked by other elements

### Docker Issues

**Container fails to start**:
- Check Docker logs: `docker-compose logs smartclock`
- Verify PulseAudio socket is mounted correctly
- Ensure Opus libraries are installed in container
- Check CGO is enabled in build

**Audio device not found in container**:
- Verify PulseAudio socket mount: `/run/pulse/native`
- Check `PULSE_SERVER` environment variable
- Ensure host PulseAudio allows network/socket connections
- Review PulseAudio configuration in `docker-compose.yml`

## License

MIT License - feel free to use this project for any purpose.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
