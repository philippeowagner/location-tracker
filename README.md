# Location Tracker - Lovelace Card (custom:location-tracker)

Location tracker is a custom [Lovelace](https://www.home-assistant.io/lovelace/) card created for [Home-Assistant](https://home-assistant.io). Location tracker has no display information. Instead, the card allows to capture device location information using HTML5 [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

*This is currently an experiment.*

## Features
- Captures device geolocation and sets it as attributes of the sensor.
- Gets the nearest zone based on current location and sets it as state of the sensor.
- Allows for user agent filtering to only update geolocation from certain devices (e.g. only update mobile).


## How It Works
The custom card is inserted into a lovelace view. When the view, and the location tracker, loads, the geolocation information of the device is captured. If user agent filtering is enabled, the card only updates the sensor when the user agent matches the criteria.

The device location is compared to all zones compared to Hassio. If the current location is within the radius of any location, it sets the zone name as the state of the device. If multiple zones fulfill this condition, then the one which is closest (least distance) is chosen. Given GPS and formula accuracy, it would be recommended to set a zone radius of at least 150-200 meters.

## Installation

1. Copy the file `location-tracker.js` on this repository onto `config/www/custom-lovelace/location-tracker/location-tracker.js`.

2. Add `location-tracker` code into ui-lovelace.yaml as follows:
```yaml
  - url: /local/custom-lovelace/location-tracker/location-tracker.js?v=0.0.0
    type: js
```

3. Add `location-tracker` card to your views (see Usage).

## Usage

### Attributes

The card allows for the following parameters:
- **type**: custom:location-tracker
- **entity**: Sensor entity to update. It will receive the state and attributes. If the entity does not exist, it creates automatically. However, it is preferable to set a template sensor for this purpose.
- **user_agent**: (Optional) If set, it will only update if the device user agent contains the substring written here. This is useful to avoid updating the location from a desktop and only update from a certain phone. You can check your user agent [doing a quick search](https://www.google.com/search?q=my+user+agent&oq=my+user+agent). You do not need to include the whole user agent, just the relevant part (e.g. "Mobile" or "iPhone").
- **scan_interval**: (Optional) Seconds between updates. If not set or set to 0, the location will only be updated when the view is refreshed. *(WIP)*


### Example
Example, add this to your lovelace view:

```yaml
   - type: custom:location-tracker
     entity: sensor.nito_tracker
     user_agent: "Mobile"
     scan_interval: 900
 ```
 
 This example will update the `sensor.nito_tracker` with geolocation of the devices visiting the view, but only if the user agent contains "Mobile" (aka: exclude Desktop). A new scan should happen after 15min (900 seconds); although currently this is not possible (see Caveats).
 
### Other Considerations

The sensor does not need to exist before updating it. If it didn't exist before, the sensor will be automatically created. However, to avoid errors issues of other templates/automations saying that the sensor does not exist, we would advise creating an "empty" template sensor:

```yaml
sensor:
  - platform: template
    sensors:
      nito_tracker:
        value_template: "unknown"
```

## Caveats

At the moment, the location update is "manual". It only happens when the Lovelace view is loaded. The scan interval for background and periodic updates is not available due to device capabilities. Methods explored:

1. Using setInterval() to scan every X seconds/minutes. However, when the device goes on lock, the setInterval() is stopped and updates are not carried.
1. Using `<iframe>` with `<meta>` tag for `refresh` page. However, this is also stopped when the phone is locked.
1. Using serviceWorkers and [periodicSync](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/periodicSync). Unfortunately, this only allows the service worker to run without much control over the frontend. Additionally, the geolocation API is [not enabled on the service worker](https://github.com/RichardMaher/Brotkrumen) and the update cannot be triggered on the background.
