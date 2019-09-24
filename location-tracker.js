/**
 * Creates a Lovelace custom card (HTML Element) capable of reporting current
 * device location to a sensor.
 *
 * The attributes are the geolocation position of the device.
 * The state represents the nearest zone, if the zone is within radius.
 *
 * For this state to be known, zone component must be set up with the name,
 * latitude, longitude and radius of the different zones. Recommended radius is
 * at least 150-200 meters to compensate from error in accuracy and formula
 * calculation deviation.
 *
 * Usage:
 * - type: custom:location-tracker
 * - entity: Sensor entity to update. It will receive the state and attributes.
 *     If the entity does not exist, it creates automatically. However, it is
 *     preferable to set a template sensor for this purpose.
 * - user_agent: (Optional) If set, it will only update if the device user agent
 *     contains the substring written here. This is useful to avoid updating
 *     the location from a desktop and only update from a certain phone.
 * - scan_interval: (Optional) Seconds between updates. If not set or set to 0,
 *     the location will only be updated when the view is refreshed. (WIP)
 *
 * Example, add this to your lovelace:
 *   - type: custom:location-tracker
 *     entity: sensor.nito_tracker
 *     user_agent: "Mobile"
 *     scan_interval: 900
 */

/**
 * Coordinates of a Hassio zone.
 * @typedef {{
 *   name: string,
 *   latitude: number,
 *   longitude: number,
 *   radius: number,
 *   distance: number,
 *   withinRadius: boolean
 * }}
 */
let ZoneCoordinates;

/**
 * Device coordinates.
 * Parameters can take string when they are null, which gets replaced with
 * "unknwon".
 * @typedef {{
 *   accuracy: number|string,
 *   altitude: number|string,
 *   altitude_accuracy: number|string,
 *   heading: number|string,
 *   latitude: number,
 *   longitude: number,
 *   speed: number|string,
 *   last_updated: number
 * }}
 */
let DeviceCoordinates;

const _UNKNOWN_STATE = 'unknown';


class LocationTrackerElement extends HTMLElement {

  /** Initializes LocationTrackerElement and updates location. */
  constructor() {
    super();
    this.updateLocation();
  }

  /**
   * Sets the configuration of the lovelace card.
   * @param {{
   *   type: string,
   *   entity: string,
   *   user_agent: string,
   *   scan_interval: number
   * }} config Config of the lovelace card.
   */
  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity.');
    }
    this._config = config;
  }

  /**
   * Gets the card size. Required by Lovelace. Return empty.
   * @return {number} Empty size.
   */
  getCardSize() {
    return 0;
  }

  /**
   * Gets the entity id to which update location.
   * @return {string} Entity id.
   */
  _getEntityId() {
    return this._config.entity;
  }

  /**
   * Gets the scan interval (in seconds).
   * @return {number|undefined} Scan interval in which to update geolocation.
   */
  _getScanInterval() {
    return this._config.scan_interval;
  }

  /**
   * Gets the user agent substring on the configuration.
   * @return {string} User agent string to match towards actual user agent.
   */
  _getUserAgentConfig() {
    return this._config.user_agent;
  }

  /**
   * Gets the time since the last update of the entity.
   * @return {number} Timestamp of the last entity update. Zero if not found.
   */
  _getLastUpdateTime() {
    const entityId = this._getEntityId();
    const entityState = this.hass.states[entityId];
    if (!entityState) return 0;
    if (!entityState.attributes) return 0;
    if (!entityState.attributes.last_updated) return 0;
    return entityState.attributes.last_updated;
  }

  /**
   * Verifies whether it is time for an update.
   * This is true when the current timestamp is above the last update plus the
   * scan interval.
   * @return {boolean} Whether it is time to update the geoloaction.
   */
  _isTimeForUpdate() {
    const lastUpdatedTimestamp = this._getLastUpdateTime();
    const currentTimestamp = new Date().getTime();
    const scanInterval = this._getScanInterval();
    return (currentTimestamp > (lastUpdatedTimestamp + scanInterval * 100));
  }

  /**
   * Updates state of the entity.
   * @param {{
   *   state: string,
   *   attributes: !DeviceCoordinates
   * }} entityState New state (and attributes) to set on the entity.
   */
  _updateEntityState(entityState) {
    const entityId = this._getEntityId();
    const updateMethod = 'POST';
    const updateEntityPath = `states/${entityId}`;
    this.hass.callApi(updateMethod, updateEntityPath, entityState);
  }

  /** Updates device location on the entity. */
  updateLocation() {
    // Not ready to update location as config or hass data are missing.
    if (!this.hass || !this._config) {
      this._setTimeoutUpdate();
      return;
    }

    // Only update location for those devices which matches user agent string.
    const userAgentString = this._getUserAgentConfig();
    if (userAgentString && !navigator.userAgent.includes(userAgentString)) {
      return;
    }

    const classThis = this;
    const bindTrackLocation = (position) => {
      classThis._trackLocation(position);
    };

    navigator.geolocation.getCurrentPosition(
      bindTrackLocation, this._logTrackLocationError);

    this._scheduleLocationUpdate();
  }

  /**
   * Logs errors coming from getCurrentPosition.
   * @param {!Error} errorMessage Error when trying to get location.
   */
  _logTrackLocationError(errorMessage) {
    throw new Error(errorMessage);
  }

  /**
   * Gets location and updates entity with the data.
   * The attributes represent the device location.
   * The state represents the nearest zone to the current location.
   * @param {!Position} position Geolocation information of the device.
   */
  _trackLocation(position) {
    const locationAttributes = this._getNewEntityAttributes(position);
    const entityState = this._getNewEntityState(locationAttributes);
    const entityNewState = {
      'attributes': locationAttributes,
      'state': entityState,
    };
    this._updateEntityState(entityNewState);
  }

  /**
   * Gets the new attributes for the entity.
   * @param {!Position} postion Geolocation information of the device.
   * @return {!DeviceCoordinates} Entity attributes.
   */
  _getNewEntityAttributes(position) {
    const coordinates = position.coords;
    const timestamp = position.timestamp;
    return {
      'accuracy': coordinates.accuracy || _UNKNOWN_STATE,
      'altitude': coordinates.altitude || _UNKNOWN_STATE,
      'altitude_accuracy': coordinates.altitudeAccuracy || _UNKNOWN_STATE,
      'heading': coordinates.heading || _UNKNOWN_STATE,
      'latitude': coordinates.latitude,
      'longitude': coordinates.longitude,
      'speed': coordinates.speed || _UNKNOWN_STATE,
      'last_updated': timestamp,
    };
  }

  /**
   * Gets the new state for the entity.
   * State will be the name of the closest zone.
   * @return {string} New state for the entity.
   */
  _getNewEntityState(locationAttributes) {
    const zonesCoordinates = this._getAllZoneCoordinates(locationAttributes);
    return this._getClosestZone(zonesCoordinates);
  }

  /**
   * Gets the coordinates data from all configured zones in Hassio.
   * @param {!DeviceCoordinates>} locationAttributes Attributes from the entity
   *   representing the device geolocation.
   * @return {!Array<!ZoneCoordinates>} List of zones with their geo data.
   */
  _getAllZoneCoordinates(locationAttributes) {
    const stateEntities = Object.entries(this.hass.states);
    const zonesCoordinates = [];

    for (const [entityName, entity] of stateEntities) {
      if (!entityName.startsWith('zone.')) continue;

      const zoneCoordinates = this._getZoneEntityCoordinates(entity);
      zoneCoordinates.distance =
        this._calculateDistance(locationAttributes, zoneCoordinates);
      zoneCoordinates.withinRadius =
        this._isLocationWithinRadius(locationAttributes, zoneCoordinates)

      zonesCoordinates.push(zoneCoordinates);
    }

    return zonesCoordinates;
  }

  /**
   * Gets the geolocation data from a given zone in Hassio.
   * @param {!Object<string, *>} entity Zone entity from which to extract data.
   * @return {{
   *   name: string,
   *   latitude: number,
   *   longitude: number,
   *   radius: number
   * }} Geolocation details of the requested zone.
   */
  _getZoneEntityCoordinates(entity) {
    const zoneId = entity.entity_id;
    const zoneName = entity.attributes.friendly_name;
    const zoneCoordinates = {
      'name': zoneName || zoneId,
      'latitude': entity.attributes.latitude,
      'longitude': entity.attributes.longitude,
      'radius': entity.attributes.radius,
    };
    return zoneCoordinates;
  }

  /**
   * Calculates distance between two geolocation points in meters.
   * This leverages haversine formula to calculate the disance in meters.
   * Note: x Math.PI / 180 allos to convert to radians.
   * @param {!DeviceCoordinates>} currentCoordinates Origin coordinates.
   * @param {!ZoneCoordinates} zoneCoordinates Destination coordinates.
   * @return {number} Distance in meters between coordinates.
   */
  _calculateDistance(currentCoordinates, zoneCoordinates) {
    const currentLatitude = currentCoordinates.latitude;
    const currentLongitude = currentCoordinates.longitude;
    const zoneLatitude = zoneCoordinates.latitude;
    const zoneLongitude = zoneCoordinates.longitude;

    // Haversine formula.
    const phi1 = currentLatitude * Math.PI / 180;
    const phi2 = zoneLatitude * Math.PI / 180;
    const deltaPhi = (zoneLatitude - currentLatitude) * Math.PI / 180;
    const deltaLambda = (zoneLongitude - currentLongitude) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const earthRadiusInMeters = 6371e3; // Radius earth in metres.
    const distanceInMeters = earthRadiusInMeters * c;
    return distanceInMeters;
  }

  /**
   * Checks whether a certain location is within the radius of another zone.
   * Currently this is not compensated by accuracy and estimation error. As a
   * result, it is encouraged to use a comfortable radius such as 150-200
   * meters.
   * @param {!DeviceCoordinates>} currentCoordinates Origin coordinates.
   * @param {!ZoneCoordinates>} zoneCoordinates Destination coordinates.
   * @return {boolean} Wheather current coordinate is within radius of
   *  destination coordinates.
   */
  _isLocationWithinRadius(currentCoordinates, zoneCoordinates) {
    // TODO: improve logic to account for accuracy of current location.
    return zoneCoordinates.distance <= zoneCoordinates.radius;
  }

  /**
   * Gets the closest zone to the given point.
   * For a zone to qualify as the closest, the current coordinates must also be
   * within radius. If no known zone is within radius, then "unknown" is
   * returned.
   * @param {!Array<!ZoneCoordinates>} zonesCoordinates Coordinates of all
   *   hassio configured zones.
   * @return {string} Name of the nearest zone, within allowed radius.
   *   "unknown" if no areas are configured or none is within their allowed
   *   radius.
   */
  _getClosestZone(zonesCoordinates) {
    const zonesWithinRadius = zonesCoordinates.filter((zoneCoordinates) => {
      return zoneCoordinates.withinRadius;
    });

    if (zonesWithinRadius.length === 0) return _UNKNOWN_STATE;

    if (zonesWithinRadius.length > 1) {
      zonesWithinRadius.sort((a, b) => a.distance - b.distance);
    }

    return zonesWithinRadius[0].name;
  }

  /**
   * Calls updateLocation() after half a second.
   * Used for when we call updateLocation() but config and hassio were not
   * ready and we need to try again in a few seconds.
   */
  _setTimeoutUpdate() {
    const classThis = this;
    const bindUpdateLocation = () => {
      classThis.updateLocation();
    };
    if (this.firstTimeout) clearTimeout(this.firstTimeout);
    this.firstTimeout = setTimeout(bindUpdateLocation, 500);
  }

  /**
   * Creates a time interval to update location every X seconds (scan interval).
   */
  _setLocationIntervalScan() {
    const scanInterval = this._config.scan_interval;
    if (!scanInterval) return; // No scan interval, means manually updated.
    if (this.locationInterval) return; // Already exists.

    const classThis = this;
    const bindUpdateLocation = () => {
      classThis.updateLocation();
    };

    this.locationInterval = setInterval(
      bindUpdateLocation, scanInterval * 1000);
  }

  /**
   * Schedules a task to check location periodically. (WIP)
   * Unfortunately, mobile devices stop intervals and similar operations when
   * phone gets locked or tabs go to the background.
   * As a result, the background update is still not successfully working.
   *
   * Alternatives explored:
   * a) Using background sync using service workers, but it also does not seem
   * an option as the background (service worker) is what gets triggered every
   * X time. However, the background does not seem to be able to awake the
   * frontend and the background cannot get the geolocation.
   * b) Using iframes with meta update every X seconds. This seems to prevent
   * the browser from cleaning the setTimeout/setInterval and keep running it.
   * However, it also stops as soon as the phone is locked.
   */
  _scheduleLocationUpdate() {
    const scanInterval = this._getScanInterval();
    if (!scanInterval) return;
    if (this.scheduledUpdate) return; // Already scheduled. Do not reschedule.

    this._setLocationIntervalScan();
    this.scheduledUpdate = true;
  }
}

customElements.define('location-tracker', LocationTrackerElement);
