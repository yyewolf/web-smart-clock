"""Platform for Smart Clock sensors."""
import logging
import aiohttp

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Smart Clock sensors."""
    host = hass.data[DOMAIN][config_entry.entry_id]["host"]
    port = hass.data[DOMAIN][config_entry.entry_id]["port"]
    
    async_add_entities([
        SmartClockSnapStatusSensor(hass, host, port),
        SmartClockAudioStatusSensor(hass, host, port),
    ], True)

class SmartClockSnapStatusSensor(SensorEntity):
    """Representation of Snapclient status sensor."""

    def __init__(self, hass: HomeAssistant, host: str, port: int) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._host = host
        self._port = port
        self._attr_name = "Smart Clock Snapclient"
        self._attr_unique_id = f"smart_clock_{host}_{port}_snapclient"
        self._attr_icon = "mdi:music"
        self._state = "unknown"

    @property
    def state(self):
        """Return the state of the sensor."""
        return self._state

    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, f"{self._host}_{self._port}")},
            "name": "Smart Clock",
            "manufacturer": "Custom",
            "model": "Smart Clock v1",
        }

    async def async_update(self) -> None:
        """Fetch new state data for this sensor."""
        url = f"http://{self._host}:{self._port}/api/snap/status"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    self._state = "running" if data.get("running", False) else "stopped"
                else:
                    self._state = "error"
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error getting snapclient status: %s", err)
            self._state = "unavailable"

class SmartClockAudioStatusSensor(SensorEntity):
    """Representation of Audio stream status sensor."""

    def __init__(self, hass: HomeAssistant, host: str, port: int) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._host = host
        self._port = port
        self._attr_name = "Smart Clock Audio Stream"
        self._attr_unique_id = f"smart_clock_{host}_{port}_audio_stream"
        self._attr_icon = "mdi:speaker"
        self._state = "unknown"

    @property
    def state(self):
        """Return the state of the sensor."""
        return self._state

    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, f"{self._host}_{self._port}")},
            "name": "Smart Clock",
            "manufacturer": "Custom",
            "model": "Smart Clock v1",
        }

    async def async_update(self) -> None:
        """Fetch new state data for this sensor."""
        # This would require an additional endpoint in your Go backend
        # For now, we'll set it as a placeholder
        # You can add GET /api/audio/status to your backend
        self._state = "active"
