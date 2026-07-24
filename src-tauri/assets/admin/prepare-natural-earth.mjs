#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const NATURAL_EARTH_TAG = "v5.1.2";
const SOURCE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_TAG}/geojson`;
const ADMIN0_SOURCE = "ne_10m_admin_0_countries_chn.geojson";
const ADMIN1_SOURCE = "ne_10m_admin_1_states_provinces.geojson";
const outputDirectory = dirname(fileURLToPath(import.meta.url));

function stringProperty(properties, key) {
  const value = properties[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function admin0Code(properties) {
  return (
    stringProperty(properties, "ADM0_A3_CN") ??
    stringProperty(properties, "ADM0_A3") ??
    stringProperty(properties, "ADM0_A3_EH") ??
    "-99"
  );
}

function displayName(properties, chineseKey, fallbackKey) {
  return stringProperty(properties, chineseKey) ?? stringProperty(properties, fallbackKey) ?? "Unknown";
}

async function fetchGeoJson(fileName, directory) {
  const response = await fetch(`${SOURCE_BASE}/${fileName}`);
  if (!response.ok) {
    throw new Error(`下载 ${fileName} 失败：${response.status} ${response.statusText}`);
  }

  const sourcePath = join(directory, fileName);
  await writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
  return JSON.parse(await readFile(sourcePath, "utf8"));
}

function prepareAdmin0(source) {
  return {
    type: "FeatureCollection",
    features: source.features.map((feature) => ({
      type: "Feature",
      properties: {
        name: displayName(feature.properties, "NAME_ZH", "NAME"),
        code: admin0Code(feature.properties),
        source_code: stringProperty(feature.properties, "ADM0_A3") ?? "-99",
      },
      geometry: feature.geometry,
    })),
  };
}

function prepareAdmin1(source, countryNames) {
  return {
    type: "FeatureCollection",
    features: source.features.map((feature) => {
      const properties = feature.properties;
      const isTaiwan = stringProperty(properties, "adm0_a3") === "TWN";
      const countryCode = isTaiwan ? "CHN" : stringProperty(properties, "adm0_a3") ?? "-99";
      return {
        type: "Feature",
        properties: {
          name: isTaiwan ? "台湾省" : displayName(properties, "name_zh", "name"),
          country: countryNames.get(countryCode) ?? stringProperty(properties, "admin") ?? "Unknown",
          country_code: countryCode,
          code: stringProperty(properties, "adm1_code") ?? "-99",
        },
        geometry: feature.geometry,
      };
    }),
  };
}

async function main() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "geotable-natural-earth-"));
  try {
    const [admin0Source, admin1Source] = await Promise.all([
      fetchGeoJson(ADMIN0_SOURCE, temporaryDirectory),
      fetchGeoJson(ADMIN1_SOURCE, temporaryDirectory),
    ]);
    const admin0 = prepareAdmin0(admin0Source);
    const countryNames = new Map(admin0.features.map((feature) => [feature.properties.code, feature.properties.name]));
    const admin1 = prepareAdmin1(admin1Source, countryNames);

    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(outputDirectory, "admin0.geojson"), JSON.stringify(admin0)),
      writeFile(join(outputDirectory, "admin1.geojson"), JSON.stringify(admin1)),
    ]);
    console.log(`已生成 Natural Earth ${NATURAL_EARTH_TAG} 边界资产。`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
