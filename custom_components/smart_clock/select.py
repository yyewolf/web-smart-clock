"""Platform for Smart Clock tab control."""
import logging
import aiohttp

from homeassistant.components.select import SelectEntity
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
    """Set up the Smart Clock tab control."""
    host = hass.data[DOMAIN][config_entry.entry_id]["host"]
    port = hass.data[DOMAIN][config_entry.entry_id]["port"]
    
    async_add_entities([SmartClockTab(hass, host, port)], True)

class SmartClockTab(SelectEntity):
    """Representation of Smart Clock tab selector."""

    _attr_options = ["clock", "audio", "settings", "info"]

    def __init__(self, hass: HomeAssistant, host: str, port: int) -> None:
        """Initialize the select."""
        self.hass = hass
        self._host = host
        self._port = port
        self._attr_name = "Smart Clock Tab"
        self._attr_unique_id = f"smart_clock_{host}_{port}_tab"
        self._attr_icon = "mdi:tab"
        self._attr_current_option = "clock"

    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, f"{self._host}_{self._port}")},
            "name": "Smart Clock",
            "manufacturer": "Custom",
            "model": "Smart Clock v1",
        }

    async def async_select_option(self, option: str) -> None:
        """Change the selected tab."""
        url = f"http://{self._host}:{self._port}/api/tab/set"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.post(
                url,
                json={"tab": option},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    self._attr_current_option = option
                else:
                    _LOGGER.error("Failed to set tab: %s", response.status)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error setting tab: %s", err)

    async def async_update(self) -> None:
        """Fetch new state data for this select."""
        url = f"http://{self._host}:{self._port}/api/tab"
        session = async_get_clientsession(self.hass)
        
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    self._attr_current_option = data.get("tab", "clock")
                else:
                    _LOGGER.error("Failed to get tab: %s", response.status)
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.error("Error getting tab: %s", err)
