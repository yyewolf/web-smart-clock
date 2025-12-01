# Build stage
FROM golang:1.21-alpine AS builder

# Install build dependencies for Opus
RUN apk add --no-cache gcc musl-dev opus-dev opusfile-dev pkgconfig

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum* ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -o smartclock .

# Runtime stage
FROM alpine:latest

# Install snapclient and required dependencies including opus library
RUN apk add --no-cache \
    snapcast-client \
    alsa-lib \
    alsa-utils \
    pulseaudio \
    pulseaudio-alsa \
    pulseaudio-utils \
    ffmpeg \
    bash \
    opus \
    opusfile \
    ca-certificates \
    tzdata

WORKDIR /app

# Copy the built binary from builder
COPY --from=builder /app/smartclock .

# Copy static files
COPY --from=builder /app/static ./static

# Create a non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser && \
    chown -R appuser:appuser /app

# Expose port
EXPOSE 8080

# Environment variables
ENV PORT=8080
ENV SNAPSERVER_HOST=snapserver
ENV SNAPSERVER_PORT=1704
ENV TZ=UTC

# Switch to non-root user
USER appuser

# Create startup script
USER root
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "Starting PulseAudio..."' >> /start.sh && \
    echo 'pulseaudio --start --exit-idle-time=-1 --log-target=stderr &' >> /start.sh && \
    echo 'sleep 3' >> /start.sh && \
    echo 'echo "Configuring PulseAudio module-null-sink for loopback..."' >> /start.sh && \
    echo 'pactl load-module module-null-sink sink_name=snapcast_sink sink_properties=device.description="Snapcast_Sink"' >> /start.sh && \
    echo 'pactl set-default-sink snapcast_sink' >> /start.sh && \
    echo 'echo "Starting snapclient with PulseAudio output..."' >> /start.sh && \
    echo 'snapclient -h ${SNAPSERVER_HOST} -p ${SNAPSERVER_PORT} --player pulse &' >> /start.sh && \
    echo 'sleep 3' >> /start.sh && \
    echo 'echo "Starting smart clock server..."' >> /start.sh && \
    echo 'exec /app/smartclock' >> /start.sh && \
    chmod +x /start.sh

USER appuser

# Start PulseAudio, snapclient and the web server
CMD ["/start.sh"]
