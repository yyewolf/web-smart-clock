# Smart Clock - Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)

Home Assistant custom component for Smart Clock integration.

## Features

- **Brightness Control**: Control your Smart Clock display brightness as a light entity
- **Snapclient Status**: Monitor Snapclient running status
- **Audio Stream Status**: Monitor audio streaming status

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant instance
2. Click on "Integrations"
3. Click the three dots in the top right corner
4. Select "Custom repositories"
5. Add this repository URL: `https://github.com/yewolf/smart-clock` (or your actual repo URL)
6. Select category: "Integration"
7. Click "Add"
8. Find "Smart Clock" in the integration list and install it
9. Restart Home Assistant

### Manual Installation

1. Copy the `custom_components/smart_clock` folder to your Home Assistant's `custom_components` directory
2. Restart Home Assistant

## Configuration

1. Go to Configuration -> Integrations
2. Click the "+ Add Integration" button
3. Search for "Smart Clock"
4. Enter your Smart Clock's IP address and port (default: 8080)
5. Click Submit

## Entities

After configuration, the following entities will be created:

### Light
- `light.smart_clock_display` - Control display brightness (0-255)

### Sensors
- `sensor.smart_clock_snapclient` - Snapclient status (running/stopped)
- `sensor.smart_clock_audio_stream` - Audio stream status

## Usage Examples

### Automations

**Turn off display at night:**
```yaml
automation:
  - alias: "Smart Clock - Night Mode"
    trigger:
      - platform: time
        at: "22:00:00"
    action:
      - service: light.turn_off
        entity_id: light.smart_clock_display
```

**Adjust brightness based on sun:**
```yaml
automation:
  - alias: "Smart Clock - Auto Brightness"
    trigger:
      - platform: state
        entity_id: sun.sun
    action:
      - service: light.turn_on
        entity_id: light.smart_clock_display
        data:
          brightness: >
            {% if is_state('sun.sun', 'above_horizon') %}
            255
            {% else %}
            50
            {% endif %}
```

### Scripts

**Dim display:**
```yaml
script:
  dim_smart_clock:
    sequence:
      - service: light.turn_on
        entity_id: light.smart_clock_display
        data:
          brightness: 50
```

## Requirements

- Home Assistant 2023.1.0 or newer
- Smart Clock backend running and accessible on your network

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/yewolf/smart-clock/issues).

## License

MIT License
