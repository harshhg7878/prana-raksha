const buildAddress = (tags = {}) => {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ").trim(),
    tags["addr:suburb"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    tags["addr:state"],
  ].filter(Boolean);

  return parts.join(", ");
};

const toRadians = (value) => (value * Math.PI) / 180;

const calculateDistanceKm = (from, to) => {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((earthRadiusKm * c).toFixed(1));
};

const findNearestHospitalsFromMap = async ({
  latitude,
  longitude,
  limit = 3,
  radiusMeters = 15000,
}) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return [];
  }

  const query = `
[out:json][timeout:20];
(
  nwr["amenity"="hospital"](around:${radiusMeters},${lat},${lon});
);
out center tags;
`.trim();

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "PranaRaksha/1.0 emergency-platform",
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error("Failed to fetch nearby hospitals from OpenStreetMap");
  }

  const data = await response.json();
  const incidentPoint = { latitude: lat, longitude: lon };

  return (data.elements || [])
    .map((element) => {
      const hospitalLat = Number(element.lat ?? element.center?.lat);
      const hospitalLon = Number(element.lon ?? element.center?.lon);

      if (!Number.isFinite(hospitalLat) || !Number.isFinite(hospitalLon)) {
        return null;
      }

      return {
        hospitalName: element.tags?.name || "Nearby Hospital",
        address: buildAddress(element.tags),
        distanceKm: calculateDistanceKm(incidentPoint, {
          latitude: hospitalLat,
          longitude: hospitalLon,
        }),
        freeBeds: 0,
        totalBeds: 0,
        icuFree: 0,
        ambulanceEtaMinutes: 0,
        occupiedPercent: 0,
        latitude: hospitalLat,
        longitude: hospitalLon,
        source: "OpenStreetMap",
        isConnected: false,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, limit);
};

module.exports = {
  findNearestHospitalsFromMap,
};
