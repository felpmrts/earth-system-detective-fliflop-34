# 🚀 NASA Space Apps Challenge 2026: Strategic Dossier & High-Level Decision Guide

> **Objective:** Equip your team with a surgical, technical, and results-driven analysis to win the 48-hour NASA Space Apps 2026 marathon.

---

## 🌐 How to Launch the Decision System for Your Team

So you and your teammates can access simultaneously, view detailed challenge dossiers, and vote in real time from any device, the `server.py` server was created.

### Option A: On the Same Wi-Fi (Zero Setup)
In the project folder terminal, run:
```bash
python3 server.py
```
The terminal will print the addresses:
- **On your own PC:** `http://localhost:8080`
- **For teammates on the same Wi-Fi:** `http://[YOUR_LOCAL_IP]:8080` (e.g., `http://192.168.1.15:8080`)
- *All votes are automatically saved and synced in real time in `votes.json`.*

### Option B: For Teammates Outside Your Home (Over the Internet, Free)
With `python3 server.py` running, open another terminal and use any secure tunnel service:
- **Via Localtunnel (no signup):**
  ```bash
  npx localtunnel --port 8080
  ```
- **Via Cloudflare Tunnel (free and stable):**
  ```bash
  cloudflared tunnel --url http://localhost:8080
  ```
- **Via Ngrok:**
  ```bash
  ngrok http 8080
  ```
The generated HTTPS link can be shared in the team's WhatsApp/Discord so everyone can vote from anywhere.

---

## 🧭 NASA Judging Methodology: How to Win in 48 Hours

Official NASA Space Apps judging is weighted across four 25% pillars:

```
 ┌────────────────────────────────────────┐
 │ 1. GALACTIC IMPACT (25%)               │ -> Solves a real pain on Earth or in space?
 ├────────────────────────────────────────┤
 │ 2. VALID USE OF NASA DATA (25%)        │ -> Were real open datasets connected?
 ├────────────────────────────────────────┤
 │ 3. MVP PROTOTYPE VIABILITY (25%)       │ -> Does the software run without crashing?
 ├────────────────────────────────────────┤
 │ 4. PITCH & STORYTELLING (240s) (25%)   │ -> Is the video narrative clear & compelling?
 └────────────────────────────────────────┘
```

---

## 📊 Summary Matrix of Skills & 48h Risk Across the 14 Challenges

| # | Challenge | Category | Difficulty | Frontend | Backend | Science | Pitch | 48h Risk |
|---|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **01** | *Abandoned but not Forgotten* | Moon & Mars | Beginner | 4/5 | 2/5 | 2/5 | 5/5 | 🟢 Low |
| **02** | *Be An Earth System Trend Detective!* | Earth & Climate | Intermediate | 3/5 | 5/5 | 4/5 | 3/5 | 🟡 Medium |
| **03** | *Build a Junior Astronaut Mission Trainer* | Gamification | Intermediate | 5/5 | 2/5 | 3/5 | 4/5 | 🟡 Medium |
| **04** | *Create Health Monitoring Software* | Space Health | Intermediate | 4/5 | 4/5 | 4/5 | 3/5 | 🟢 Low/Med |
| **05** | *Dancing with the SARs* | NISAR Radar | Advanced | 4/5 | 5/5 | 5/5 | 4/5 | 🔴 High |
| **06** | *Field Shift: Adapting Farms* | Agri & Climate | Beginner | 4/5 | 3/5 | 3/5 | 5/5 | 🟢 Low |
| **07** | *Flame in Freefall* | ISS Combustion | Advanced | 3/5 | 5/5 | 5/5 | 3/5 | 🔴 High |
| **08** | *Harmonization of MODIS & VIIRS* | Wildfires | Intermediate | 3/5 | 5/5 | 4/5 | 4/5 | 🟡 Medium |
| **09** | *Identify Earth Locations Analog* | Geology | Beginner | 4/5 | 3/5 | 3/5 | 4/5 | 🟢 Low |
| **10** | *Interplanetary Survival Guide: Martian Map* | Cartography | Intermediate | 5/5 | 3/5 | 3/5 | 4/5 | 🟡 Medium |
| **11** | *Lunar Landing Site Navigator* | Artemis South Pole | Advanced | 4/5 | 5/5 | 5/5 | 3/5 | 🔴 High |
| **12** | *Planet X and SPHEREx* | Astronomy | Intermediate | 4/5 | 4/5 | 4/5 | 4/5 | 🟡 Medium |
| **13** | *Space Mission Design Game* | Gamification | Intermediate | 5/5 | 2/5 | 3/5 | 5/5 | 🟡 Medium |
| **14** | *The Earth Information Jukebox* | Sonification | Beginner | 4/5 | 2/5 | 3/5 | 5/5 | 🟢 Low |

---

## 🔍 Complete Dossier of the 14 Official Challenges (2026)

---

### 1. Abandoned but not Forgotten: Storytelling about NASA's Discarded Equipment on the Moon and Mars
- **🎯 Real NASA Context:** With the imminent return of crewed missions to the Moon (Artemis) and future fleets of private rovers on Mars, there is a risk of destroying or burying historic Apollo sites and early probes under dust. NASA wants awareness and tools to preserve space archaeological heritage.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* Three.js, React, Tailwind CSS, Spline 3D, or Cesium.js for the lunar and Martian 3D globe.
  - *Backend & Data (Effort 2/5 - Light):* Simple Node.js or Python to serve geospatial metadata and GeoJSON coordinates.
  - *Science & Domain (Effort 2/5 - Accessible):* Space exploration history, landing coordinates, and lunar dust physics (plume blast).
  - *Storytelling & Pitch (Effort 5/5 - Critical):* Emotional narrative script, immersive audio design, and connection to the future.
- **📡 Official Data & Satellites:** Lunar Reconnaissance Orbiter Camera (LROC), NASA Mars Trek, Apollo Lunar Surface Experiments Package (ALSEP), and NASA historical archives.
- **✅ Pros:** Immediate emotional appeal; low math barrier; huge potential for a cinematic pitch video.
- **❌ Cons:** Can feel like a trivial blog or Wikipedia copy if interactive technical innovation is missing.
- **🚨 48h Alert:** Build an *Interactive Space Archaeology* mechanic: the user excavates 3D regolith layers and uncovers the engineering lessons behind each piece of equipment's failures and successes.
- **💡 The Secret Weapon:** *The Martian & Lunar Heritage Archive*: 3D viewer with landing exclusion zones for Artemis spacecraft, preserving historic artifacts with dust simulation.

---

### 2. Be An Earth System Trend Detective!
- **🎯 Real NASA Context:** NASA's Earth Science division has operated satellite constellations for over 25 years. The challenge is crossing those petabytes of time series to detect systemic anomalies (severe droughts, marine heatwaves, and aquifer degradation) before they become irreversible disasters.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 3/5 - Medium):* D3.js, Plotly, Leaflet, or Deck.gl for geospatial time-series visualization.
  - *Backend & Data (Effort 5/5 - Critical):* Python, FastAPI, Xarray, NetCDF4, Rasterio, Pandas, NumPy for multidimensional array processing.
  - *Science & Domain (Effort 4/5 - Strong):* Climatology, remote sensing, standard deviation calculation, and statistical anomalies (Z-score).
  - *Storytelling & Pitch (Effort 3/5 - Medium):* Translating complex statistical anomalies into understandable terms for decision-makers.
- **📡 Official Data & Satellites:** MODIS (Terra/Aqua), AIRS, OMI, GRACE/GRACE-FO gravimetry satellites, and NASA Giovanni.
- **✅ Pros:** Direct alignment with NASA's scientific core; strong contender for the top award (*Galactic Impact*).
- **❌ Cons:** Heavy NetCDF and HDF5 files can freeze modest laptops and eat up hours in downloads.
- **🚨 48h Alert:** Pick a specific geographic subset in the first 4 hours (e.g., Amazon Basin or Cerrado drought). Do not try to load the entire globe!
- **💡 The Secret Weapon:** *Earth Anomaly Radar*: a tool that crosses 20 years of temperature anomalies (AIRS) with groundwater loss (GRACE) and warns about desertification tipping points.

---

### 3. Build a Junior Astronaut Mission Trainer
- **🎯 Real NASA Context:** Inspire the "Artemis Generation." NASA needs games and simulators where youth learn how real life support works (Sabatier urine recycling, proton radiation shielding, and growing plants in regolith).
- **🛠️ Required Skills Matrix:**
  - *Frontend & Gamedev (Effort 5/5 - Critical):* Phaser.js, Godot (WebAssembly), Unity WebGL, or React with smooth animations.
  - *Backend & Data (Effort 2/5 - Light):* Game logic running in-browser in JavaScript/TypeScript.
  - *Science & Domain (Effort 3/5 - Medium):* Per-person oxygen consumption equations, solar radiation, and energy balance.
  - *Storytelling & Pitch (Effort 4/5 - Strong):* Playful design, witty visual feedback, and clear didactics.
- **📡 Official Data & Satellites:** NASA Space Radiation Analysis Group (SRAG), ISS ECLSS system manuals, and Moon to Mars architecture.
- **✅ Pros:** Most captivating project to demo live in the video; favorite in the education and inspiration category (*Most Inspirational*).
- **❌ Cons:** 48h gamedev often fails due to scope creep and animation bugs.
- **🚨 48h Alert:** Focus on a complete *game loop* of at most 3 minutes: 3 critical decisions, immediate feedback, and scientific scoring.
- **💡 The Secret Weapon:** *Outpost Artemis Zero*: turn-based tactical survival web game where the player manages real NASA events (solar proton storm, micrometeoroids, and radiator failure).

---

### 4. Create Health Monitoring Software for Astronauts on Space Missions
- **🎯 Real NASA Context:** On Mars missions, radio delay can reach 22 minutes each way. An astronaut suffering arrhythmia or excessive radiation dose cannot wait for a doctor's reply from Earth. Medical software must be 100% autonomous and offline.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* React/Vue, Tailwind CSS, futuristic telemetry HUD-style medical dashboards.
  - *Backend & Data (Effort 4/5 - Strong):* Python, FastAPI, time-series anomaly detection (Isolation Forest / Autoencoders).
  - *Science & Domain (Effort 4/5 - Strong):* Microgravity physiology, circadian sleep, cosmic radiation, and emergency telemedicine.
  - *Storytelling & Pitch (Effort 3/5 - Medium):* Demonstration of a simulated medical crisis resolved autonomously by AI.
- **📡 Official Data & Satellites:** NASA GeneLab, Life Sciences Data Archive (LSDA), and Human Research Program (HRP).
- **✅ Pros:** Vital relevance for Mars exploration; visually striking UI design.
- **❌ Cons:** Real flight biomedical data are restricted; requires generating realistic synthetic telemetry.
- **🚨 48h Alert:** Ensure your solution is explicitly 100% OFFLINE (Edge AI), without depending on Earth-cloud API calls.
- **💡 The Secret Weapon:** *Aegis Bio-Space*: medical dashboard for Artemis/Mars spacecraft with offline autonomous triage that reprograms diet and sleep routines after radiation spikes detected during spacewalks.

---

### 5. Dancing with the SARs
- **🎯 Real NASA Context:** The NISAR (NASA-ISRO SAR) satellite uses L- and S-band microwave radar to see through clouds and darkness, measuring millimeter-scale changes in crust and vegetation. NASA wants to show the world the planet's dynamism as a living dance.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* Deck.gl, Mapbox GL JS, Three.js shaders, and smooth temporal animations.
  - *Backend & Data (Effort 5/5 - Critical):* Python, GDAL, Rasterio, HyP3 API for coherence and amplitude products.
  - *Science & Domain (Effort 5/5 - Critical):* Geodesy, phase interferometry (InSAR), and radar polarimetry.
  - *Storytelling & Pitch (Effort 4/5 - Strong):* Synchronizing ground pulses and deformations to a rhythmic, expressive visual metaphor.
- **📡 Official Data & Satellites:** NISAR mission preliminary products, Alaska Satellite Facility (ASF) DAAC, and NASA UAVSAR.
- **✅ Pros:** NISAR is NASA/ISRO's flagship mission of the moment; sky-high score in *Best Use of Science*.
- **❌ Cons:** Radar math complexity is far above average for beginners.
- **🚨 48h Alert:** DO NOT try to generate raw interferograms! Use precomputed Level 2/3 products (ground deformation, biomass loss, glacier velocity).
- **💡 The Secret Weapon:** *Terra Choreography*: interactive viewer where the user scrubs the timeline and watches Earth's "geological ballet": pulsing aquifers in summer, Arctic thaw, and the Amazon breathing via radar.

---

### 6. Field Shift: Adapting Farms with NASA Data
- **🎯 Real NASA Context:** Climate is shifting rainfall calendars and soil temperatures. Smallholder farmers don't understand raw satellite data, yet they need to know when to plant and irrigate to avoid bankruptcy.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* Mobile-first PWA, React/Vue, Tailwind CSS, clean jargon-free UI.
  - *Backend & Data (Effort 3/5 - Medium):* Python or Node.js integrating the NASA POWER REST API and SMAP satellite.
  - *Science & Domain (Effort 3/5 - Medium):* Basic agronomy, planting windows, and critical soil moisture.
  - *Storytelling & Pitch (Effort 5/5 - Critical):* Focus on real human impact: food security and income for small farmers.
- **📡 Official Data & Satellites:** NASA POWER API, SMAP (Soil Moisture Active Passive) satellite, and Landsat 8/9 NDVI.
- **✅ Pros:** NASA POWER is the easiest, most stable API in the entire hackathon; massive appeal for *Galactic Impact*.
- **❌ Cons:** Fierce competition; many teams build generic agri apps.
- **🚨 48h Alert:** Focus on accessibility: alert via automated WhatsApp/Telegram-style messages and support offline operation.
- **💡 The Secret Weapon:** *Agro-Oracle NASA*: simple co-pilot where the farmer enters their coordinate and crop, and the system advises the exact planting day to avoid next month's drought based on SMAP.

---

### 7. Flame in Freefall: AI-Powered Fire Safety Insights from Microgravity Combustion Data
- **🎯 Real NASA Context:** Without gravity, fire burns in a perfect sphere without natural buoyancy. NASA's PSI database holds decades of ISS flame videos and telemetry. NASA needs AI to predict hazardous materials and design suppression systems for Mars transit spacecraft.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 3/5 - Medium):* React, temperature/gas sensor visualizers, and 2D/3D Canvas flame simulation.
  - *Backend & Data (Effort 5/5 - Critical):* Python, PyTorch/TensorFlow, OpenCV for flame video analysis and regression.
  - *Science & Domain (Effort 5/5 - Critical):* Combustion kinetics, diffusive transport, and space thermodynamics.
  - *Storytelling & Pitch (Effort 3/5 - Medium):* Translating complex physics into practical crew-saving protocols.
- **📡 Official Data & Satellites:** NASA Physical Sciences Informatics (PSI), ACME, BASS, CIR experiments, and the Saffire project.
- **✅ Pros:** Unmatched academic and technological rigor; attracts PhD and aerospace-engineer judges.
- **❌ Cons:** Very steep learning curve in thermal physics.
- **🚨 48h Alert:** Do not build just a PDF-summarizing chatbot. Build an interactive burn-rate predictor and optimal smoke-detector placement tool.
- **💡 The Secret Weapon:** *Ignis Zero*: fire-risk simulator for space habitats showing where smoke actually accumulates without natural convection (following ventilation ducts).

---

### 8. Harmonization of MODIS and VIIRS Hot Spots
- **🎯 Real NASA Context:** The MODIS sensor (1km) has operated for 25 years, while VIIRS (375m) sees much smaller fires. That distorts ecological time series. NASA needs a consistent algorithmic conversion to enable historical analyses without false spikes.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 3/5 - Medium):* Leaflet, MapLibre GL, comparative time-series charts with Plotly/D3.
  - *Backend & Data (Effort 5/5 - Critical):* Python, GeoPandas, Shapely, Scikit-learn (spatial normalization and calibration).
  - *Science & Domain (Effort 4/5 - Strong):* Fire ecology, satellite radiometric resolution, and spatial statistics.
  - *Storytelling & Pitch (Effort 4/5 - Strong):* Focus on the Pantanal and Amazon wildfire tragedy with scientific rigor.
- **📡 Official Data & Satellites:** NASA FIRMS API (Fire Information for Resource Management System) and MODIS MCD14ML / VIIRS VNP14IMG products.
- **✅ Pros:** Immediate environmental urgency in Brazil; NASA FIRMS API is fast and structured.
- **❌ Cons:** Predominantly statistical challenge; requires visual polish so it doesn't feel dry.
- **🚨 48h Alert:** Do not build just a map with red dots (FIRMS already does that). The goal is HARMONIZATION: deliver the mathematical function and a comparable historical calendar.
- **💡 The Secret Weapon:** *Pyro-Chronos*: platform harmonizing South American wildfire data and displaying the "Historical Fire Clock," enabling fair comparison between 2005 and 2026.

---

### 9. Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars
- **🎯 Real NASA Context:** Before spending billions at the Lunar South Pole or on Mars, NASA trains crews and tests rovers in terrestrial deserts, volcanic lava tubes, and glaciers. NASA needs a systematized, quantitative catalog of these analog environments.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* Cesium.js, Mapbox GL JS, side-by-side split-screen 3D comparative visualization.
  - *Backend & Data (Effort 3/5 - Medium):* Multivariate similarity algorithm (Euclidean distance across terrain and mineralogy parameters).
  - *Science & Domain (Effort 3/5 - Medium):* Comparative planetary geology, lunar regolith, and geomorphology.
  - *Storytelling & Pitch (Effort 4/5 - Strong):* Rich narrative showing how training on Earth prevents catastrophic failures in space.
- **📡 Official Data & Satellites:** LRO Diviner & LOLA (Moon), Mars HiRISE/CRISM (Mars), and Earth elevation models (SRTM/ASTER).
- **✅ Pros:** Visually stunning; very low risk of technical failure in 48 hours.
- **❌ Cons:** Can turn into a static photo list without a quantitative matching algorithm.
- **🚨 48h Alert:** Create a numeric *Analog Match Score* ranking which Earth site is best for testing Artemis rovers.
- **💡 The Secret Weapon:** *Terra Twin*: 3D portal with "dual view" mode. Clicking the rim of Shackleton Crater at the lunar South Pole points on Earth to the exact site with the most similar terrain and mineralogy (e.g., lava tubes in Iceland).

---

### 10. Interplanetary Survival Guide: Martian Map
- **🎯 Real NASA Context:** Future astronauts on Mars will conduct scientific field traverses ("Marswalks") across hazardous terrain with limited spacesuit oxygen. They need a tactical surface navigation system that avoids steep slopes and dust storms.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 5/5 - Critical):* Leaflet/OpenLayers with Mars Trek tiles, Three.js, and a spacesuit-helmet HUD-inspired UI.
  - *Backend & Data (Effort 3/5 - Medium):* Terrain-cost routing algorithm (A* pathfinding accounting for slope angle).
  - *Science & Domain (Effort 3/5 - Medium):* Martian geography, metabolic O2 consumption, and SHARAD ice deposits.
  - *Storytelling & Pitch (Effort 4/5 - Strong):* Thrilling simulation of a scientific emergency in the style of *The Martian*.
- **📡 Official Data & Satellites:** NASA Mars Trek WMS/WMTS, MOLA Topography, HiRISE Camera, and Mars Odyssey THEMIS.
- **✅ Pros:** Strongest hard-sci-fi appeal in the hackathon; cartographic data already pre-digested in Mars Trek.
- **❌ Cons:** Trying to map the entire planet at high resolution will overload browser memory.
- **🚨 48h Alert:** Bound the area to an iconic crater (e.g., Perseverance's Jezero Crater) with high-precision routing.
- **💡 The Secret Weapon:** *Marswalk Navigator*: tactical navigation app for spacesuits that computes the route with lowest oxygen expenditure and lowest slip risk between base and a subsurface ice outcrop.

---

### 11. Lunar Landing Site Navigator
- **🎯 Real NASA Context:** At the Lunar South Pole, the Sun hugs the horizon, casting giant shadows and creating permanently shadowed craters. Landing an Artemis module or commercial lander (CLPS) requires mathematically computing whether solar panels will receive sunlight and whether the antenna will have direct line-of-sight to Earth.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* Three.js / WebGL for dynamic shadow lighting over lunar topographic mesh.
  - *Backend & Data (Effort 5/5 - Critical):* Python, Astropy, NASA Horizons API, solar azimuth/elevation vector math.
  - *Science & Domain (Effort 5/5 - Critical):* Celestial mechanics, astronomical ephemerides, and rugged polar relief.
  - *Storytelling & Pitch (Effort 3/5 - Medium):* Crystal-clear explanation of how the tool prevents the spacecraft from freezing without power.
- **📡 Official Data & Satellites:** LRO LOLA Digital Elevation Models, NASA Horizons Ephemeris System, and Moon Trek illumination studies.
- **✅ Pros:** Highest pure-engineering value in the competition; top favorite for *Best Mission Concept*.
- **❌ Cons:** Spherical geometry and shadow occlusion over rugged terrain are complex.
- **🚨 48h Alert:** Don't reinvent orbital physics from scratch! Use precomputed Horizons API ephemerides and cross them with LRO elevation maps.
- **💡 The Secret Weapon:** *Artemis Sun-Finder*: tool where NASA planners click any of the 13 South Pole landing sites and view a simultaneous timeline of "Sunlight" and "Direct Earth Line-of-Sight," pinpointing the perfect landing day.

---

### 12. Planet X and SPHEREx
- **🎯 Real NASA Context:** The SPHEREx space observatory will survey the entire sky in 102 infrared channels. Comparing sky images across different epochs lets scientists spot unknown asteroids, cool brown dwarfs, or even the hypothetical ninth planet of the solar system.
- **🛠️ Required Skills Matrix:**
  - *Frontend & UI/UX (Effort 4/5 - Strong):* React, Canvas API (pixel manipulation), snappy zooming web FITS file viewer.
  - *Backend & Data (Effort 4/5 - Strong):* Python, AstroPy, OpenCV (background subtraction and star centroid identification).
  - *Science & Domain (Effort 4/5 - Strong):* Astrometry, infrared spectroscopy, and orbital dynamics of celestial bodies.
  - *Storytelling & Pitch (Effort 4/5 - Strong):* The mystery of hunting for Planet Nine and citizen-science gamification.
- **📡 Official Data & Satellites:** SPHEREx Simulation Archive, WISE/NEOWISE Infrared Survey, and NASA Planetary Data System (PDS).
- **✅ Pros:** Cutting-edge observational astronomy; high public engagement.
- **❌ Cons:** Handling WCS headers and .FITS files intimidates anyone new to astronomy.
- **🚨 48h Alert:** Use the *Blink Comparator* technique (rapidly alternating two frames to make the moving object "jump" on screen). Simple to code and delights every judge.
- **💡 The Secret Weapon:** *SPHEREx Sky Hunter*: gamified platform where users blink infrared images and flag moving anomalies, generating an automatic astrometric report for NASA submission.

---

### 13. Space Mission Design Game
- **🎯 Real NASA Context:** Every space mission is a puzzle of brutal trade-offs: adding more science instruments requires more fuel, which increases rocket cost and can blow the Congressional budget. NASA wants a game teaching the art of systems-engineering trade-offs.
- **🛠️ Required Skills Matrix:**
  - *Frontend & Gamedev (Effort 5/5 - Critical):* React/Vue, Tailwind CSS, mass-balance animations, and NASA launch-terminal aesthetics.
  - *Backend & Data (Effort 2/5 - Light):* Game economy running in-browser in TypeScript/JavaScript.
  - *Science & Domain (Effort 3/5 - Medium):* Systems engineering, basic delta-V, watt generation, and component reliability.
  - *Storytelling & Pitch (Effort 5/5 - Critical):* Humor, ethical cost-cutting dilemmas, and countdown tension.
- **📡 Official Data & Satellites:** NASA Cost Estimating Handbook, NASA Systems Engineering Handbook, and Launch Services Program rocket specs.
- **✅ Pros:** Most fun and addictive project of the hackathon; sky-high judge engagement.
- **❌ Cons:** Trying to build real-time 3D orbital physics (Kerbal Space Program style) guarantees not finishing.
- **🚨 48h Alert:** Build a turn/card-based tactical decision game (*Reigns* style or management sim).
- **💡 The Secret Weapon:** *Director: Mission to Enceladus*: the player has $800M and 5 minutes to assemble a mission to search for life on Enceladus. Every choice (nuclear vs. solar, ice drill vs. spectrometer) shifts launch explosion probability and science data return.

---

### 14. The Earth Information Jukebox
- **🎯 Real NASA Context:** Billions interact with NASA climate data through visual charts, but visually impaired people are excluded from that knowledge. Data sonification converts physical variables (temperature, wind, ocean currents) into frequencies and rhythms, democratizing access and creating immediate empathy with the planet.
- **🛠️ Required Skills Matrix:**
  - *Frontend & Audio (Effort 4/5 - Strong):* Web Audio API, Tone.js, in-browser virtual synthesizers, and WCAG accessibility (screen readers).
  - *Backend & Data (Effort 2/5 - Light):* Normalizing climate time series to audible Hertz frequencies.
  - *Science & Domain (Effort 3/5 - Medium):* Musical scales (major/minor), sound synthesis, and global warming anomalies.
  - *Storytelling & Pitch (Effort 5/5 - Critical):* Inclusion of visually impaired people in science and headphone demo in the pitch.
- **📡 Official Data & Satellites:** NASA GISTEMP (global temperature), OCO-2/OCO-3 (atmospheric CO2), and NOAA/NASA Coral Reef Watch.
- **✅ Pros:** Extreme originality (very few teams do audio); guaranteed 10/10 in accessibility and empathy.
- **❌ Cons:** If it sounds like disjointed noise, it loses scientific credibility.
- **🚨 48h Alert:** Map real metrics to harmonic musical notes: cold years sound like deep cello notes, while recent warming spikes rise into high tones and accelerated percussion.
- **💡 The Secret Weapon:** *Symphony of a Changing Planet*: 100% screen-reader-accessible climate jukebox playing Earth's climate history from 1880 to 2026 as a generative orchestral suite, letting users "hear" global warming with integrated audio description.

---

## 🎯 Practical Roadmap for Today's Decision:

1. Start the local server: `python3 server.py`
2. Open `http://localhost:8080` and send the link to your teammate.
3. Read the detailed dossiers on the cards by clicking **"Open Full Strategic Dossier"**.
4. Everyone submits 1-to-5-star ratings.
5. The dashboard will highlight the team's **High-Consensus Challenge**!
