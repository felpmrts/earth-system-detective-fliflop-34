# Catálogo de Famílias Ambientais e Variáveis — Earth System Trend Detective

> **Guia para o Frontend e Backend:** Este documento organiza todas as variáveis disponíveis nas APIs integradas do projeto em **Famílias Ambientais** intuitivas para a jornada do usuário ("Detetive de Dados").

---

## 🌡️ Família 1: Temperatura e Calor (Atmosfera e Superfície)
**Foco da Investigação:** Aquecimento global, ondas de calor, ilhas de calor urbanas e mudanças na amplitude térmica.

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Temperatura Média do Ar (2m)** | `T2M` | NASA POWER (MERRA-2) | ⚡ Tempo Real | °C | Temperatura média do ar na altura humana (2 metros). Principal indicador de aquecimento climático. |
| **Temperatura Máxima do Ar (2m)** | `T2M_MAX` | NASA POWER (MERRA-2) | ⚡ Tempo Real | °C | Picos de calor extremo registrados em cada mês. |
| **Temperatura Mínima do Ar (2m)** | `T2M_MIN` | NASA POWER (MERRA-2) | ⚡ Tempo Real | °C | Madrugadas mais frias; se estiver subindo rápido, indica retenção de calor noturno. |
| **Amplitude Térmica Diária** | `T2M_RANGE` | NASA POWER (MERRA-2) | ⚡ Tempo Real | °C | Diferença entre a máxima e a mínima diária. Mudanças bruscas afetam safras agrícolas e ecossistemas. |
| **Temperatura da Superfície (Solo/Piso)** | `TS` | NASA POWER (MERRA-2) | ⚡ Tempo Real | °C | Temperatura da "pele" da Terra (asfalto, solo exposto, copa das árvores). |
| **Temp. de Superfície Diurna (Satélite)** | `LST_Day_CMG` (`MOD11C3`) | AppEEARS (MODIS) | 🛰️ Fila / Cache | K $\rightarrow$ °C | Medição térmica de alta resolução (5 km) durante o dia. Excelente para detectar **ilhas de calor urbanas**. |
| **Temp. de Superfície Noturna (Satélite)** | `LST_Night_CMG` (`MOD11C3`) | AppEEARS (MODIS) | 🛰️ Fila / Cache | K $\rightarrow$ °C | Medição térmica noturna por satélite; mostra o quanto o solo ou a cidade demora para esfriar à noite. |
| **Ponto de Orvalho (2m)** | `T2MDEW` | NASA POWER (MERRA-2) | ⚡ Tempo Real | °C | Temperatura em que o vapor d'água condensa; ligada à sensação de abafamento e formação de neblina. |

---

## 🌧️ Família 2: Chuva e Umidade Atmosférica
**Foco da Investigação:** Alterações no regime de chuvas, secas meteorológicas, tempestades e aridez do ar.

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Precipitação Total Corrigida (Chuva)** | `PRECTOTCORR` | NASA POWER (GPM/MERRA-2) | ⚡ Tempo Real | mm/dia *(ou mm/mês)* | Volume de chuva combinando satélite e pluviômetros. Mostra se está chovendo mais ou menos na região. |
| **Precipitação por Satélite (Alta Res.)** | `GPM_3IMERGM` | Giovanni (IMERG V07) | 📊 Validação / Demo | mm/mês | Grade fina (0,1°) do satélite GPM. Ideal para validar tendências regionais de precipitação. |
| **Umidade Relativa do Ar (2m)** | `RH2M` | NASA POWER (MERRA-2) | ⚡ Tempo Real | % | Percentual de saturação de vapor no ar. Quedas contínuas ao longo das décadas indicam **aridificação**. |
| **Umidade Específica do Ar (2m)** | `QV2M` | NASA POWER (MERRA-2) | ⚡ Tempo Real | g/kg | Massa real de vapor d'água presente no ar (independente da variação de temperatura). |
| **Água Precipitável na Atmosfera** | `TQV` | NASA POWER / Giovanni | ⚡ Tempo Real | kg/m² (mm) | Quantidade total de vapor d'água na coluna atmosférica; indica potencial para chuvas intensas. |

---

## 🌱 Família 3: Solo, Seca Agrícola e Evapotranspiração
**Foco da Investigação:** Desertificação, disponibilidade de água para lavouras/florestas e estresse hídrico subterrâneo.
*(⚠️ Nota técnica: No oceano, as variáveis `GWET*` retornam `-999` e devem ser tratadas como `NaN`).*

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Umidade Superficial do Solo** | `GWETTOP` | NASA POWER (MERRA-2 Land) | ⚡ Tempo Real | Fração (0 a 1) | Grau de saturação de água nos primeiros 5 cm de terra (0 = totalmente seco, 1 = solo saturado). |
| **Umidade na Zona das Raízes** | `GWETROOT` | NASA POWER (MERRA-2 Land) | ⚡ Tempo Real | Fração (0 a 1) | Água disponível até ~1 metro de profundidade, onde as raízes das plantas e lavouras absorvem água. |
| **Umidade Profunda do Solo (Perfil)** | `GWETPROF` | NASA POWER (MERRA-2 Land) | ⚡ Tempo Real | Fração (0 a 1) | Reserva hídrica total do perfil do solo até o lençol freático superficial. |
| **Evapotranspiração Total** | `Evap_tavg` (`GLDAS_NOAH`) | Giovanni / Hydrology TS | 📊 Validação / Demo | mm/dia | Soma da água que evapora do solo + transpiração das plantas. Se sobe enquanto a chuva cai, acelera a seca. |
| **Escoamento Superficial (Runoff)** | `Qs_acc` (`GLDAS_NOAH`) | Giovanni / Hydrology TS | 📊 Validação / Demo | kg/m² | Água da chuva que não infiltra no solo e escorre para os rios (aumenta com impermeabilização e desmatamento). |

---

## 🌊 Família 4: Rios, Vazão e Bacias Hidrográficas
**Foco da Investigação:** Enchentes severas, redução histórica do volume de rios e impacto de barragens/uso da terra.

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vazão do Rio (Série Histórica)** | `river_discharge` | Open-Meteo Flood (GloFAS) | ⚡ Tempo Real | m³/s | Volume de água passando pelo canal do rio a cada segundo. Detecta se o rio está perdendo volume nas últimas décadas. |
| **Vazão Média do Rio** | `river_discharge_mean` | Open-Meteo Flood (GloFAS) | ⚡ Tempo Real | m³/s | Comportamento médio do fluxo hídrico para comparar anos regulares contra anos extremos. |
| **Pico Máximo de Cheia** | `river_discharge_max` | Open-Meteo Flood (GloFAS) | ⚡ Tempo Real | m³/s | Avalia se as cheias e inundações extremas estão ficando mais volumosas a cada década. |
| **Vazão Mínima Crítica (Estiagem)** | `river_discharge_min` | Open-Meteo Flood (GloFAS) | ⚡ Tempo Real | m³/s | Mede o nível mais crítico que o rio atinge na estação seca (essencial para abastecimento e hidroelétricas). |

---

## 🌳 Família 5: Vegetação, Florestas e Uso da Terra
**Foco da Investigação:** Desmatamento, regeneração florestal, impacto de queimadas e vigor da biomassa.

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Índice de Vegetação (NDVI)** | `_1_km_monthly_NDVI` (`MOD13A3`) | AppEEARS / Giovanni | 🛰️ Fila / Cache | Índice (-1 a +1) | Mede o "verdor" e a densidade de folhas verdes. Quedas significativas indicam **desmatamento ou degradação**. |
| **Índice de Vegetação Melhorado (EVI)** | `_1_km_monthly_EVI` (`MOD13A3`) | AppEEARS (MODIS) | 🛰️ Fila / Cache | Índice (-1 a +1) | Similar ao NDVI, mas não satura em florestas muito densas (ideal para monitorar a **Amazônia** e Mata Atlântica). |
| **Índice de Área Foliar (LAI)** | `Lai_500m` (`MOD15A2H`) | AppEEARS (MODIS) | 🛰️ Fila / Cache | m²/m² | Quantidade de camadas de folhas sobre o solo; mede a densidade estrutural da floresta ou safra. |
| **Albedo da Superfície** | `ALLSKY_SRF_ALB` | NASA POWER | ⚡ Tempo Real | Fração (0 a 1) | Fração de luz solar refletida pelo solo. Quando uma floresta vira pasto/cidade ou o gelo derrete, o albedo muda. |

---

## ☀️ Família 6: Radiação Solar, Nuvens, Ventos e Atmosfera
**Foco da Investigação:** Potencial de energia solar/eólica, nebulosidade, circulação de ventos e poluição/queimadas.

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Radiação Solar Incidente** | `ALLSKY_SFC_SW_DWN` | NASA POWER | ⚡ Tempo Real | kW-hr/m²/dia | Energia solar que chega ao solo (considerando nuvens). Fundamental para agricultura e energia fotovoltaica. |
| **Radiação Solar de Céu Limpo** | `CLRSKY_SFC_SW_DWN` | NASA POWER | ⚡ Tempo Real | kW-hr/m²/dia | Radiação solar sem interferência de nuvens; quedas indicam presença de fumaça ou poluição atmosférica. |
| **Radiação Infravermelha (Efeito Estufa)**| `ALLSKY_SFC_LW_DWN` | NASA POWER | ⚡ Tempo Real | W/m² | Radiação térmica emitida pela atmosfera de volta para o solo (ligada à retenção de calor e efeito estufa). |
| **Cobertura de Nuvens** | `CLOUD_AMT` | NASA POWER | ⚡ Tempo Real | % | Porcentagem média do céu coberto por nuvens ao longo dos meses e décadas. |
| **Velocidade do Vento (2m e 10m)** | `WS2M` / `WS10M` | NASA POWER | ⚡ Tempo Real | m/s | Velocidade média do vento próximo ao solo (2m, afeta evaporação) e na altura meteorológica padrão (10m). |
| **Velocidade do Vento p/ Turbinas (50m)** | `WS50M` | NASA POWER | ⚡ Tempo Real | m/s | Vento na altura de aerogeradores; revela se o potencial de geração eólica está mudando na região. |
| **Pressão Atmosférica na Superfície** | `PS` | NASA POWER | ⚡ Tempo Real | kPa | Peso da coluna de ar; tendências de longo prazo indicam mudanças em sistemas de alta/baixa pressão. |
| **Espessura Óptica de Aerossóis (Fumaça)**| `AOD_550` (`MOD08_M3`) | Giovanni (MODIS) | 📊 Validação / Demo | Adimensional | Mede partículas suspensas no ar (plumas de fumaça de queimadas, poeira desértica e poluição urbana). |

---

## 📡 Família 7: Estações Meteorológicas em Solo (Validação Local)
**Foco da Investigação:** Confrontar as estimativas de satélites e modelos globais com medições físicas reais feitas em aeroportos e estações terrestres (`NOAA CDO API v2` — Datasets `GSOM` / `GHCND`).

| Nome na Interface (UI) | Código / Parâmetro | Fonte / API | Modo | Unidade | Explicação Simples para o Usuário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Chuva na Estação (Pluviômetro)** | `PRCP` | NOAA CDO API v2 | ⚡ Tempo Real | mm | Água acumulada medida fisicamente dentro do coletor da estação meteorológica local. |
| **Temperatura Média na Estação** | `TAVG` | NOAA CDO API v2 | ⚡ Tempo Real | °C | Temperatura média registrada pelo termômetro físico oficial da estação terrestre. |
| **Temp. Máxima e Mínima na Estação** | `TMAX` / `TMIN` | NOAA CDO API v2 | ⚡ Tempo Real | °C | Extremos térmicos medidos fisicamente no abrigo meteorológico local. |
| **Queda e Acúmulo de Neve** | `SNOW` / `SNWD` | NOAA CDO API v2 | ⚡ Tempo Real | mm | Neve precipitada e profundidade acumulada no solo (útil para investigar derretimento em regiões frias/cordilheiras). |
| **Velocidade Média do Vento (Solo)** | `AWND` | NOAA CDO API v2 | ⚡ Tempo Real | m/s | Velocidade média do vento medida diretamente pelo anemômetro físico da estação. |
