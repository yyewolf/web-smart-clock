"""Platform for Smart Clock button controls."""
import logging
import aiohttp

from homeassistant.components.button import ButtonEntity
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
    """Set up the Smart Clock button controls."""
    host = hass.data[DOMAIN][config_entry.entry_id]["host"]
    port = hass.data[DOMAIN][config_entry.entry_id]["port"]
    
    async_add_entities([SmartClockRefreshButton(hass, host, port)], True)

class SmartClockRefreshButton(ButtonEntity):
    """Representation of Smart Clock refresh button."""

    def __init__(self, hass: HomeAssistant, host: str, port: int) -> None:
        """Initialize the button."""
        self.hass = hass
        self._host = host
        self._port = port
        self._attr_name = "Smart Clock Refresh"
        self._attr_unique_id = f"smart_clock_{host}_{port}_refresh"
        self._attr_icon = "mdi:refresh"

    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, f"{self._host}_{self._port}")},
            "name": "Smart Clock",
            "manufacturer": "Custom",
            "model": "Smart Clock v1",
        }

    async def async_press(self) -> None:
        """Handle the button press to refresh the browser."""
        url = f"http://{self._host}:{self._port}/api/refresh"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.post(
                url,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    _LOGGER.info("Refresh command sent to Smart Clock")
                else:
                    _LOGGER.error("Failed to send refresh command: %s", response.status)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error sending refresh command: %s", err)
