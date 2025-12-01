"""Platform for Smart Clock brightness control."""
import logging
import aiohttp

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ColorMode,
    LightEntity,
)
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
    """Set up the Smart Clock brightness control."""
    host = hass.data[DOMAIN][config_entry.entry_id]["host"]
    port = hass.data[DOMAIN][config_entry.entry_id]["port"]
    
    async_add_entities([SmartClockBrightness(hass, host, port)], True)

class SmartClockBrightness(LightEntity):
    """Representation of Smart Clock brightness as a light."""

    def __init__(self, hass: HomeAssistant, host: str, port: int) -> None:
        """Initialize the light."""
        self.hass = hass
        self._host = host
        self._port = port
        self._attr_name = "Smart Clock Display"
        self._attr_unique_id = f"smart_clock_{host}_{port}_brightness"
        self._attr_color_mode = ColorMode.BRIGHTNESS
        self._attr_supported_color_modes = {ColorMode.BRIGHTNESS}
        self._brightness = 128  # Home Assistant uses 0-255, we'll convert to 0-100
        self._attr_is_on = True

    @property
    def brightness(self) -> int:
        """Return the brightness of this light between 0..255."""
        # Convert from 0-100 (backend) to 0-255 (Home Assistant)
        return int((self._brightness / 100) * 255)

    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, f"{self._host}_{self._port}")},
            "name": "Smart Clock",
            "manufacturer": "Custom",
            "model": "Smart Clock v1",
        }

    async def async_turn_on(self, **kwargs) -> None:
        """Turn on the light."""
        brightness_255 = kwargs.get(ATTR_BRIGHTNESS, 255)
        # Convert from Home Assistant's 0-255 to backend's 0-100
        brightness_100 = int((brightness_255 / 255) * 100)
        
        url = f"http://{self._host}:{self._port}/api/brightness/set"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.post(
                url,
                json={"brightness": brightness_100},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    self._brightness = brightness_100  # Store as 0-100
                    self._attr_is_on = True
                else:
                    _LOGGER.error("Failed to set brightness: %s", response.status)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error setting brightness: %s", err)

    async def async_turn_off(self, **kwargs) -> None:
        """Turn off the light (set brightness to 0)."""
        url = f"http://{self._host}:{self._port}/api/brightness/set"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.post(
                url,
                json={"brightness": 0},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    self._brightness = 0
                    self._attr_is_on = False
                else:
                    _LOGGER.error("Failed to turn off: %s", response.status)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error turning off: %s", err)

    async def async_update(self) -> None:
        """Fetch new state data for this light."""
        url = f"http://{self._host}:{self._port}/api/brightness"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    # Backend returns 0-100, store as-is
                    self._brightness = data.get("brightness", 50)
                    self._attr_is_on = self._brightness > 0
                else:
                    _LOGGER.error("Failed to get brightness: %s", response.status)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error getting brightness: %s", err)
