# Smart Clock System

A Go-based smart clock web application with real-time audio streaming capabilities using Snapcast and WebRTC.

## Features

- 🕐 **Real-time Clock Display** - Live updating time and date display
- 🔊 **Audio Streaming** - WebRTC-based audio streaming integration with Snapcast
- 🌐 **Web Interface** - Beautiful, responsive web UI accessible from any device
- 🐳 **Docker Support** - Fully containerized with Docker and Docker Compose
- 📡 **WebSocket Communication** - Real-time bidirectional communication
- 🎵 **Snapclient Integration** - Built-in Snapcast client for synchronized audio playback

## Architecture

The application consists of:

- **Go Backend** (`main.go`): HTTP server with WebSocket support for real-time communication
- **Web Frontend** (`static/`): HTML/CSS/JavaScript responsive UI
- **Snapcast Integration**: Audio synchronization using Snapcast client/server
- **WebRTC**: Browser-based audio streaming capability

## Prerequisites

### Running with Docker (Recommended)
- Docker
- Docker Compose

### Running Locally
- Go 1.21 or higher
- Snapcast client (optional, for audio features)

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

### Docker Compose Configuration

Edit `docker-compose.yml` to customize:
- Port mappings
- Snapcast server configuration
- Volume mounts

## Project Structure

```
test-clock/
├── main.go                 # Go backend server
├── go.mod                  # Go module dependencies
├── Dockerfile              # Docker image configuration
├── docker-compose.yml      # Docker Compose setup
├── .gitignore             # Git ignore rules
├── README.md              # This file
└── static/                # Web frontend files
    ├── index.html         # Main HTML page
    ├── styles.css         # Styling
    └── app.js             # JavaScript application logic
```

## API Endpoints

### HTTP Endpoints

- `GET /` - Serves the web interface
- `GET /api/snap/status` - Returns Snapclient status

### WebSocket Endpoint

- `WS /ws` - WebSocket connection for real-time communication

## WebSocket Message Format

### Server → Client (Clock Update)
```json
{
  "time": "15:04:05",
  "date": "Monday, January 2, 2006",
  "timestamp": 1234567890
}
```

### Client → Server (WebRTC Signaling)
```json
{
  "type": "webrtc-offer",
  "offer": {...}
}
```

## Audio Streaming

The application supports audio streaming through two methods:

1. **Snapcast** - For synchronized multi-room audio
   - Connect to Snapcast server for synchronized playback
   - Controlled via environment variables

2. **WebRTC** - For browser-based audio streaming
   - Direct peer-to-peer audio streaming
   - Controlled via web interface buttons

## Development

### Building

```bash
go build -o smartclock .
```

### Testing

```bash
go test ./...
```

### Adding Features

The modular architecture makes it easy to extend:

- Add new WebSocket message handlers in `main.go`
- Extend the UI in `static/index.html` and `static/app.js`
- Add new API endpoints in the HTTP handlers

## Troubleshooting

### Snapclient not connecting
- Verify `SNAPSERVER_HOST` and `SNAPSERVER_PORT` environment variables
- Check if Snapcast server is running
- Review container logs: `docker-compose logs snapserver`

### WebSocket connection failed
- Ensure the server is running
- Check browser console for errors
- Verify firewall settings

### Audio not playing
- Check browser permissions for audio playback
- Verify Snapclient is running: check status via web interface
- Review browser console for WebRTC errors

## License

MIT License - feel free to use this project for any purpose.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
