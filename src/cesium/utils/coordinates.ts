import * as Cesium from 'cesium'

/**
 * Convert geographic coordinates + ocean depth to Cesium Cartesian3 with vertical exaggeration.
 * Depths in the ocean are negative heights relative to WGS84 surface.
 */
export function oceanDepthToCartesian(
  lat: number,
  lon: number,
  depth_m: number,
  exaggeration = 1.0
): Cesium.Cartesian3 {
  // Invert depth: 100m depth = -100 * exaggeration meters altitude
  const altitude = -Math.max(0, depth_m) * exaggeration
  return Cesium.Cartesian3.fromDegrees(lon, lat, altitude)
}

/**
 * Convert lat/lon bounds to Cesium Rectangle
 */
export function boundsToRectangle(
  lat_min: number,
  lat_max: number,
  lon_min: number,
  lon_max: number
): Cesium.Rectangle {
  return Cesium.Rectangle.fromDegrees(lon_min, lat_min, lon_max, lat_max)
}

/**
 * Standard Indian Ocean region presets
 */
export const INDIAN_OCEAN_REGIONS = {
  INDIAN_OCEAN: {
    id: 'indian_ocean',
    name: 'Indian Ocean (Overview)',
    lat_min: -15,
    lat_max: 25,
    lon_min: 50,
    lon_max: 100,
    heading: 0,
    pitch: -35,
    range: 2200000,
  },
  ARABIAN_SEA: {
    id: 'arabian_sea',
    name: 'Arabian Sea',
    lat_min: 5,
    lat_max: 27,
    lon_min: 50,
    lon_max: 78,
    heading: 355,
    pitch: -42,
    range: 3200000,
  },
  BAY_OF_BENGAL: {
    id: 'bay_of_bengal',
    name: 'Bay of Bengal',
    lat_min: 5,
    lat_max: 24,
    lon_min: 78,
    lon_max: 98,
    heading: 0,
    pitch: -42,
    range: 2900000,
  },
  SOMALI_BASIN: {
    id: 'somali_basin',
    name: 'Somali Current & Basin',
    lat_min: -10,
    lat_max: 15,
    lon_min: 40,
    lon_max: 65,
    heading: 10,
    pitch: -40,
    range: 3400000,
  },
  EQUATORIAL_IO: {
    id: 'equatorial_io',
    name: 'Equatorial Indian Ocean',
    lat_min: -10,
    lat_max: 10,
    lon_min: 60,
    lon_max: 95,
    heading: 0,
    pitch: -45,
    range: 4000000,
  },
  ANDAMAN_SEA: {
    id: 'andaman_sea',
    name: 'Andaman Sea',
    lat_min: 6,
    lat_max: 16,
    lon_min: 91,
    lon_max: 100,
    heading: 0,
    pitch: -38,
    range: 1800000,
  },
}
