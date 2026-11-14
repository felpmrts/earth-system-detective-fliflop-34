# 🚀 NASA Space Apps Challenge 2026: Dossiê Estratégico & Guia de Decisão de Alto Nível

> **Objetivo:** Instrumentar a sua equipe com uma análise cirúrgica, técnica e orientada a resultados para vencer a maratona de 48 horas da NASA Space Apps 2026.

---

## 🌐 Como Colocar o Sistema de Decisão no Ar para sua Equipe

Para que você e seus amigos possam acessar simultaneamente, ver os desafios detalhados e votar em tempo real de qualquer dispositivo, foi criado o servidor [`server.py`](file:///home/zrhyan/Principal/Computation/Space%20Apps/server.py).

### Opção A: No mesmo Wi-Fi (Sem instalar nada)
No terminal da pasta do projeto, execute:
```bash
python3 server.py
```
O terminal informará os endereços:
- **No seu próprio PC:** `http://localhost:8080`
- **Para seus amigos no mesmo Wi-Fi:** `http://[SEU_IP_LOCAL]:8080` (ex: `http://192.168.1.15:8080`)
- *Todos os votos são gravados automaticamente e sincronizados em tempo real em `votes.json`.*

### Opção B: Para amigos fora da sua casa (Pela Internet, sem custos)
Com o `python3 server.py` rodando, abra outro terminal e use qualquer serviço de túnel seguro:
- **Via Localtunnel (sem cadastro):**
  ```bash
  npx localtunnel --port 8080
  ```
- **Via Cloudflare Tunnel (gratuito e estável):**
  ```bash
  cloudflared tunnel --url http://localhost:8080
  ```
- **Via Ngrok:**
  ```bash
  ngrok http 8080
  ```
O link HTTPS gerado pode ser enviado no WhatsApp/Discord da equipe para votarem de qualquer lugar.

---

## 🧭 Metodologia dos Jurados da NASA: Como Ganhar em 48 Horas

A avaliação oficial da NASA Space Apps é ponderada em 4 pilares de 25%:

```
 ┌────────────────────────────────────────┐
 │ 1. IMPACTO GALÁCTICO (25%)             │ -> Resolve dor real na Terra ou no espaço?
 ├────────────────────────────────────────┤
 │ 2. USO VÁLIDO DE DADOS DA NASA (25%)   │ -> Dados abertos reais foram conectados?
 ├────────────────────────────────────────┤
 │ 3. VIABILIDADE DO PROTÓTIPO MVP (25%) │ -> O software funciona sem travar no teste?
 ├────────────────────────────────────────┤
 │ 4. PITCH & STORYTELLING (240s) (25%)   │ -> A narrativa no vídeo é clara e emocionante?
 └────────────────────────────────────────┘
```

---

## 📊 Matriz Resumida de Habilidades & Risco dos 14 Desafios

| # | Desafio | Categoria | Dificuldade | Frontend | Backend | Ciência | Pitch | Risco 48h |
|---|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **01** | *Abandoned but not Forgotten* | Lua & Marte | Iniciante | 4/5 | 2/5 | 2/5 | 5/5 | 🟢 Baixo |
| **02** | *Be An Earth System Trend Detective!* | Terra & Clima | Intermediário | 3/5 | 5/5 | 4/5 | 3/5 | 🟡 Médio |
| **03** | *Build a Junior Astronaut Mission Trainer* | Gamificação | Intermediário | 5/5 | 2/5 | 3/5 | 4/5 | 🟡 Médio |
| **04** | *Create Health Monitoring Software* | Saúde Espacial | Intermediário | 4/5 | 4/5 | 4/5 | 3/5 | 🟢 Baixo/Médio |
| **05** | *Dancing with the SARs* | Radar NISAR | Avançado | 4/5 | 5/5 | 5/5 | 4/5 | 🔴 Alto |
| **06** | *Field Shift: Adapting Farms* | Agro & Clima | Iniciante | 4/5 | 3/5 | 3/5 | 5/5 | 🟢 Baixo |
| **07** | *Flame in Freefall* | Combustão ISS | Avançado | 3/5 | 5/5 | 5/5 | 3/5 | 🔴 Alto |
| **08** | *Harmonization of MODIS & VIIRS* | Queimadas | Intermediário | 3/5 | 5/5 | 4/5 | 4/5 | 🟡 Médio |
| **09** | *Identify Earth Locations Analog* | Geologia | Iniciante | 4/5 | 3/5 | 3/5 | 4/5 | 🟢 Baixo |
| **10** | *Interplanetary Survival Guide: Martian Map* | Cartografia | Intermediário | 5/5 | 3/5 | 3/5 | 4/5 | 🟡 Médio |
| **11** | *Lunar Landing Site Navigator* | Artemis Polo Sul | Avançado | 4/5 | 5/5 | 5/5 | 3/5 | 🔴 Alto |
| **12** | *Planet X and SPHEREx* | Astronomia | Intermediário | 4/5 | 4/5 | 4/5 | 4/5 | 🟡 Médio |
| **13** | *Space Mission Design Game* | Gamificação | Intermediário | 5/5 | 2/5 | 3/5 | 5/5 | 🟡 Médio |
| **14** | *The Earth Information Jukebox* | Sonificação | Iniciante | 4/5 | 2/5 | 3/5 | 5/5 | 🟢 Baixo |

---

## 🔍 Dossiê Completo dos 14 Desafios Oficiais (2026)

---

### 1. Abandoned but not Forgotten: Storytelling about NASA's Discarded Equipment on the Moon and Mars
- **🎯 Contexto Real da NASA:** Com a volta iminente de missões tripuladas à Lua (Artemis) e futuras frotas de rovers privados em Marte, há o risco de destruir ou soterrar com poeira os sítios históricos das missões Apollo e das primeiras sondas. A NASA quer conscientização e ferramentas de preservação do patrimônio arqueológico espacial.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* Three.js, React, Tailwind CSS, Spline 3D ou Cesium.js para o globo 3D lunar e marciano.
  - *Backend & Dados (Esforço 2/5 - Leve):* Node.js ou Python simples para servir metadados geoespaciais e coordenadas em GeoJSON.
  - *Ciência & Domínio (Esforço 2/5 - Acessível):* História da exploração espacial, coordenadas de pouso e física de poeira lunar (plume blast).
  - *Storytelling & Pitch (Esforço 5/5 - Crítico):* Roteiro narrativo emocionante, design de áudio imersivo e conexão com o futuro.
- **📡 Dados & Satélites Oficiais:** Lunar Reconnaissance Orbiter Camera (LROC), NASA Mars Trek, Apollo Lunar Surface Experiments Package (ALSEP) e arquivos históricos da NASA.
- **✅ Prós:** Apelo emocional imediato; baixa barreira matemática; potencial imenso para um vídeo de pitch cinematográfico.
- **❌ Contras:** Pode parecer um blog trivial ou cópia da Wikipédia se faltar inovação técnica interativa.
- **🚨 Alerta 48h:** Construa uma mecânica de *Arqueologia Espacial Interativa*: o usuário escava camadas de regolito em 3D e descobre as lições de engenharia por trás de cada falha e sucesso do equipamento.
- **💡 O Pulo do Gato:** *The Martian & Lunar Heritage Archive*: visualizador 3D com zonas de exclusão de pouso para naves Artemis, preservando os artefatos históricos com simulação de poeira.

---

### 2. Be An Earth System Trend Detective!
- **🎯 Contexto Real da NASA:** A divisão de ciências da Terra da NASA opera constelações de satélites há mais de 25 anos. O desafio é cruzar esses petabytes de séries temporais para detectar anomalias sistêmicas (secas severas, ondas de calor marinho e degradação de aquíferos) antes que se tornem desastres irreversíveis.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 3/5 - Médio):* D3.js, Plotly, Leaflet ou Deck.gl para visualização de séries temporais geoespaciais.
  - *Backend & Dados (Esforço 5/5 - Crítico):* Python, FastAPI, Xarray, NetCDF4, Rasterio, Pandas, NumPy para manipulação de matrizes multidimensionais.
  - *Ciência & Domínio (Esforço 4/5 - Forte):* Climatologia, sensoriamento remoto, cálculo de desvio padrão e anomalias estatísticas (Z-score).
  - *Storytelling & Pitch (Esforço 3/5 - Médio):* Traduzir anomalias estatísticas complexas em termos compreensíveis para tomadores de decisão.
- **📡 Dados & Satélites Oficiais:** MODIS (Terra/Aqua), AIRS, OMI, satélites de gravimetria GRACE/GRACE-FO e NASA Giovanni.
- **✅ Prós:** Alinhamento direto com o núcleo científico da NASA; forte candidato ao prêmio máximo (*Galactic Impact*).
- **❌ Contras:** Arquivos NetCDF e HDF5 pesados podem travar computadores modestos e consumir horas com download.
- **🚨 Alerta 48h:** Escolha um recorte geográfico específico nas primeiras 4 horas (ex: Bacia Amazônica ou seca no Cerrado). Não tente carregar o globo inteiro!
- **💡 O Pulo do Gato:** *Earth Anomaly Radar*: ferramenta que cruza 20 anos de anomalias de temperatura (AIRS) com perda de água subterrânea (GRACE) e alerta sobre pontos de não retorno de desertificação.

---

### 3. Build a Junior Astronaut Mission Trainer
- **🎯 Contexto Real da NASA:** Inspirar a "Geração Artemis". A NASA precisa de jogos e simuladores onde jovens aprendam como funciona o suporte de vida real (reciclagem de urina Sabatier, blindagem de radiação de prótons e cultivo de plantas em regolito).
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & Gamedev (Esforço 5/5 - Crítico):* Phaser.js, Godot (WebAssembly), Unity WebGL ou React com animações fluidas.
  - *Backend & Dados (Esforço 2/5 - Leve):* Lógica do jogo executada no navegador em JavaScript/TypeScript.
  - *Ciência & Domínio (Esforço 3/5 - Médio):* Equações de consumo de oxigênio por pessoa, radiação solar e balanço energético.
  - *Storytelling & Pitch (Esforço 4/5 - Forte):* Design lúdico, feedbacks visuais bem-humorados e didática clara.
- **📡 Dados & Satélites Oficiais:** NASA Space Radiation Analysis Group (SRAG), manuais do sistema ECLSS da ISS e arquitetura Moon to Mars.
- **✅ Prós:** Projeto mais cativante de demonstrar ao vivo no vídeo; favorito na categoria de educação e inspiração (*Most Inspirational*).
- **❌ Contras:** Gamedev em 48h costuma falhar por escopo inflado e bugs de animação.
- **🚨 Alerta 48h:** Foque em um *game loop* completo de no máximo 3 minutos: 3 decisões críticas, feedback imediato e pontuação científica.
- **💡 O Pulo do Gato:** *Outpost Artemis Zero*: jogo web de sobrevivência tática em turnos onde o jogador gerencia eventos reais da NASA (tempestade solar de prótons, micrometeróides e pane em radiadores).

---

### 4. Create Health Monitoring Software for Astronauts on Space Missions
- **🎯 Contexto Real da NASA:** Em missões para Marte, o delay de rádio pode chegar a 22 minutos em cada sentido. Um astronauta sofrendo arritmia ou dose excessiva de radiação não pode esperar pela resposta de um médico na Terra. O software médico precisa ser 100% autônomo e offline.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* React/Vue, Tailwind CSS, dashboards médicos no estilo HUD de telemetria futurista.
  - *Backend & Dados (Esforço 4/5 - Forte):* Python, FastAPI, detecção de anomalias em séries temporais (Isolation Forest / Autoencoders).
  - *Ciência & Domínio (Esforço 4/5 - Forte):* Fisiologia em microgravidade, sono circadiano, radiação cósmica e telemedicina de emergência.
  - *Storytelling & Pitch (Esforço 3/5 - Médio):* Demonstração de uma crise médica simulada resolvida autonomamente pela IA.
- **📡 Dados & Satélites Oficiais:** NASA GeneLab, Life Sciences Data Archive (LSDA) e Human Research Program (HRP).
- **✅ Prós:** Relevância vital para a exploração de Marte; design de interface esteticamente arrebatador.
- **❌ Contras:** Dados biomédicos de voos reais são restritos; exige criação de telemetria sintética realista.
- **🚨 Alerta 48h:** Garanta que sua solução seja explicitamente 100% OFFLINE (Edge AI), sem depender de chamadas a APIs na nuvem terrestre.
- **💡 O Pulo do Gato:** *Aegis Bio-Space*: painel médico para naves Artemis/Marte com triagem autônoma offline que reprograma dieta e rotina de sono após picos de radiação detectados em caminhadas espaciais.

---

### 5. Dancing with the SARs
- **🎯 Contexto Real da NASA:** O satélite NISAR (NASA-ISRO SAR) utiliza radar em micro-ondas de banda L e S para enxergar através de nuvens e escuridão, medindo alterações milimétricas na crosta e vegetação. A NASA quer mostrar ao mundo o dinamismo do planeta como uma dança viva.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* Deck.gl, Mapbox GL JS, Three.js shaders e animações temporais fluidas.
  - *Backend & Dados (Esforço 5/5 - Crítico):* Python, GDAL, Rasterio, HyP3 API para produtos de coerência e amplitude.
  - *Ciência & Domínio (Esforço 5/5 - Crítico):* Geodésia, interferometria de fase (InSAR) e polarimetria de radar.
  - *Storytelling & Pitch (Esforço 4/5 - Forte):* Sincronizar os pulsos e deformações do solo a uma metáfora visual rítmica e expressiva.
- **📡 Dados & Satélites Oficiais:** Produtos preliminares da missão NISAR, Alaska Satellite Facility (ASF) DAAC e NASA UAVSAR.
- **✅ Prós:** O satélite NISAR é a missão do momento da NASA/ISRO; pontuação altíssima em *Best Use of Science*.
- **❌ Contras:** Complexidade matemática de radar muito acima da média para iniciantes.
- **🚨 Alerta 48h:** NÃO tente gerar interferogramas brutos! Use produtos Nível 2/3 pré-calculados (deformação do solo, perda de biomassa, velocidade de geleiras).
- **💡 O Pulo do Gato:** *Terra Choreography*: visualizador interativo onde o usuário controla a linha do tempo e assiste ao "balé geológico" da Terra: aquíferos pulsando no verão, degelo ártico e a respiração da Amazônia via radar.

---

### 6. Field Shift: Adapting Farms with NASA Data
- **🎯 Contexto Real da NASA:** O clima está mudando o calendário das chuvas e a temperatura do solo. Pequenos agricultores não entendem dados brutos de satélite, mas precisam saber quando plantar e irrigar para não falir.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* PWA mobile-first, React/Vue, Tailwind CSS, interface limpa sem jargões.
  - *Backend & Dados (Esforço 3/5 - Médio):* Python ou Node.js integrando a API REST do NASA POWER e satélite SMAP.
  - *Ciência & Domínio (Esforço 3/5 - Médio):* Agronomia básica, janelas de semeadura e umidade crítica do solo.
  - *Storytelling & Pitch (Esforço 5/5 - Crítico):* Foco no impacto humano real: segurança alimentar e renda para pequenos agricultores.
- **📡 Dados & Satélites Oficiais:** NASA POWER API, satélite SMAP (Soil Moisture Active Passive) e Landsat 8/9 NDVI.
- **✅ Prós:** A API NASA POWER é a mais fácil e estável de toda a maratona; altíssimo apelo para *Galactic Impact*.
- **❌ Contras:** Concorrência acirrada; muitos grupos fazem apps agro genéricos.
- **🚨 Alerta 48h:** Foque na acessibilidade: alerte por mensagens automáticas tipo WhatsApp/Telegram e suporte funcionamento offline.
- **💡 O Pulo do Gato:** *Agro-Oracle NASA*: copiloto simples onde o agricultor informa sua coordenada e cultivo, e o sistema avisa o dia exato de plantio para evitar a seca do mês seguinte com base no SMAP.

---

### 7. Flame in Freefall: AI-Powered Fire Safety Insights from Microgravity Combustion Data
- **🎯 Contexto Real da NASA:** Sem gravidade, o fogo queima em formato esférico perfeito e sem empuxo natural. O banco de dados PSI da NASA contém décadas de vídeos e telemetria de chamas na ISS. A NASA precisa de IA para prever materiais perigosos e desenhar sistemas de extinção para naves em trânsito para Marte.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 3/5 - Médio):* React, visualizadores de sensores de temperatura/gás e simulação de chama em Canvas 2D/3D.
  - *Backend & Dados (Esforço 5/5 - Crítico):* Python, PyTorch/TensorFlow, OpenCV para análise de vídeo de chama e regressão.
  - *Ciência & Domínio (Esforço 5/5 - Crítico):* Cinética de combustão, transporte difusivo e termodinâmica espacial.
  - *Storytelling & Pitch (Esforço 3/5 - Médio):* Traduzir física complexa em protocolos práticos de salvação de tripulação.
- **📡 Dados & Satélites Oficiais:** NASA Physical Sciences Informatics (PSI), experimentos ACME, BASS, CIR e projeto Saffire.
- **✅ Prós:** Rigor acadêmico e tecnológico incomparável; atrai jurados doutores e engenheiros aeroespaciais.
- **❌ Contras:** Curva de aprendizado pesadíssima em física térmica.
- **🚨 Alerta 48h:** Não faça apenas um chatbot que resume PDFs. Crie um preditor interativo de velocidade de queima e posicionamento ótimo de detectores de fumaça.
- **💡 O Pulo do Gato:** *Ignis Zero*: simulador de risco de incêndio para habitats espaciais que demonstra onde a fumaça realmente se acumula sem convecção natural (seguindo os dutos de ventilação).

---

### 8. Harmonization of MODIS and VIIRS Hot Spots
- **🎯 Contexto Real da NASA:** O sensor MODIS (1km) opera há 25 anos, enquanto o sensor VIIRS (375m) enxerga focos muito menores. Isso distorce séries temporais ecológicas. A NASA precisa de uma conversão algorítmica consistente para permitir análises históricas sem falsos picos.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 3/5 - Médio):* Leaflet, MapLibre GL, gráficos comparativos temporais com Plotly/D3.
  - *Backend & Dados (Esforço 5/5 - Crítico):* Python, GeoPandas, Shapely, Scikit-learn (normalização e calibração espacial).
  - *Ciência & Domínio (Esforço 4/5 - Forte):* Ecologia do fogo, resolução radiométrica de satélites e estatística espacial.
  - *Storytelling & Pitch (Esforço 4/5 - Forte):* Foco na tragédia das queimadas no Pantanal e Amazônia com rigor científico.
- **📡 Dados & Satélites Oficiais:** NASA FIRMS API (Fire Information for Resource Management System) e produtos MODIS MCD14ML / VIIRS VNP14IMG.
- **✅ Prós:** Urgência ambiental imediata no Brasil; a API do NASA FIRMS é rápida e estruturada.
- **❌ Contras:** Desafio predominantemente estatístico; requer capricho visual para não ficar árido.
- **🚨 Alerta 48h:** Não faça só um mapa com pontinhos vermelhos (o FIRMS já faz isso). O objetivo é a HARMONIZAÇÃO: entregue a função matemática e o calendário histórico comparável.
- **💡 O Pulo do Gato:** *Pyro-Chronos*: plataforma que harmoniza os dados de queimadas da América do Sul e exibe o "Relógio Histórico do Fogo", permitindo comparar 2005 e 2026 de forma justa.

---

### 9. Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars
- **🎯 Contexto Real da NASA:** Antes de gastar bilhões no Polo Sul Lunar ou em Marte, a NASA treina tripulações e testa robôs em desertos terrestres, tubos de lava vulcânica e geleiras. A NASA precisa de um catálogo sistematizado e quantitativo desses ambientes análogos.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* Cesium.js, Mapbox GL JS, visualização comparativa lado a lado em tela dividida (Split Screen 3D).
  - *Backend & Dados (Esforço 3/5 - Médio):* Algoritmo de similaridade multivariável (distância euclidiana entre parâmetros de relevo e mineralogia).
  - *Ciência & Domínio (Esforço 3/5 - Médio):* Geologia planetária comparada, regolito lunar e geomorfologia.
  - *Storytelling & Pitch (Esforço 4/5 - Forte):* Narrativa rica mostrando como o treinamento na Terra evita falhas catastróficas no espaço.
- **📡 Dados & Satélites Oficiais:** LRO Diviner & LOLA (Lua), Mars HiRISE/CRISM (Marte) e modelos de elevação da Terra (SRTM/ASTER).
- **✅ Prós:** Visualmente deslumbrante; risco de quebra técnica baixíssimo em 48 horas.
- **❌ Contras:** Pode virar uma simples lista estática de fotos se faltar o algoritmo quantitativo de correspondência.
- **🚨 Alerta 48h:** Crie um *Analog Match Score* numérico que ranqueie qual local na Terra é o melhor para testar rovers da missão Artemis.
- **💡 O Pulo do Gato:** *Terra Twin*: portal 3D com modo "visão dupla". Ao clicar na borda da Cratera Shackleton no Polo Sul lunar, o mapa aponta na Terra o local exato com relevo e mineralogia mais semelhantes (ex: tubos de lava na Islândia).

---

### 10. Interplanetary Survival Guide: Martian Map
- **🎯 Contexto Real da NASA:** Futuros astronautas em Marte farão caminhadas de campo científicas ("Marswalks") em terrenos perigosos com consumo restrito de oxigênio no traje espacial. Eles precisam de um sistema tático de navegação de superfície que evite encostas íngremes e tempestades de areia.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 5/5 - Crítico):* Leaflet/OpenLayers com tiles do Mars Trek, Three.js e UI inspirada em HUD de capacete espacial.
  - *Backend & Dados (Esforço 3/5 - Médio):* Algoritmo de roteamento com custo de terreno (Pathfinding A* considerando inclinação de encostas).
  - *Ciência & Domínio (Esforço 3/5 - Médio):* Geografia de Marte, consumo metabólico de O2 e depósitos de gelo do SHARAD.
  - *Storytelling & Pitch (Esforço 4/5 - Forte):* Simulação eletrizante de uma emergência científica estilo o filme *Perdido em Marte*.
- **📡 Dados & Satélites Oficiais:** NASA Mars Trek WMS/WMTS, MOLA Topography, HiRISE Camera e Mars Odyssey THEMIS.
- **✅ Prós:** O tema com maior apelo de ficção científica real da maratona; dados cartográficos já mastigados no Mars Trek.
- **❌ Contras:** Querer mapear o planeta inteiro em alta resolução vai sobrecarregar a memória do navegador.
- **🚨 Alerta 48h:** Delimite a área a uma cratera icônica (ex: Cratera Jezero do Perseverance) com roteamento de alta precisão.
- **💡 O Pulo do Gato:** *Marswalk Navigator*: app de navegação tática para trajes espaciais que calcula a rota com menor gasto de oxigênio e menor risco de escorregamento entre a base e um afloramento de gelo subterrâneo.

---

### 11. Lunar Landing Site Navigator
- **🎯 Contexto Real da NASA:** No Polo Sul da Lua, o Sol fica rente à linha do horizonte, produzindo sombras gigantescas e crateras escuras eternas. Pousar um módulo da Artemis ou lander comercial (CLPS) exige calcular com exatidão matemática se os painéis solares receberão luz e se a antena terá visada direta para a Terra.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* Three.js / WebGL para iluminação de sombras dinâmicas sobre malha topográfica lunar.
  - *Backend & Dados (Esforço 5/5 - Crítico):* Python, Astropy, NASA Horizons API, cálculos de vetores azimute/elevação solar.
  - *Ciência & Domínio (Esforço 5/5 - Crítico):* Mecânica celeste, efemérides astronômicas e relevo polar acidentado.
  - *Storytelling & Pitch (Esforço 3/5 - Médio):* Explicar com clareza cristalina como a ferramenta evita que a nave congele sem energia.
- **📡 Dados & Satélites Oficiais:** LRO LOLA Digital Elevation Models, NASA Horizons Ephemeris System e estudos de iluminação do Moon Trek.
- **✅ Prós:** O maior valor de engenharia pura da competição; favoritíssimo para *Best Mission Concept*.
- **❌ Contras:** Cálculos de geometria esférica e oclusão de sombras em relevo acidentado são complexos.
- **🚨 Alerta 48h:** Não reinvente a física orbital do zero! Use efemérides pré-calculadas da Horizons API e cruze com os mapas de elevação do LRO.
- **💡 O Pulo do Gato:** *Artemis Sun-Finder*: ferramenta onde planejadores da NASA clicam em qualquer um dos 13 sítios de pouso do Polo Sul e visualizam uma régua temporal simultânea de "Luz Solar" e "Visada Direta para a Terra", apontando o dia perfeito de pouso.

---

### 12. Planet X and SPHEREx
- **🎯 Contexto Real da NASA:** O observatório espacial SPHEREx varrerá todo o céu em 102 canais de infravermelho. Comparando imagens do céu em épocas diferentes, cientistas podem identificar asteroides desconhecidos, anãs marrons frias ou até o hipotético nono planeta do sistema solar.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & UI/UX (Esforço 4/5 - Forte):* React, Canvas API (manipulação de pixels), visualizador de arquivos FITS web com zoom ágil.
  - *Backend & Dados (Esforço 4/5 - Forte):* Python, AstroPy, OpenCV (subtração de fundo e identificação de centróides de estrelas).
  - *Ciência & Domínio (Esforço 4/5 - Forte):* Astrometria, espectroscopia no infravermelho e dinâmica orbital de corpos celestes.
  - *Storytelling & Pitch (Esforço 4/5 - Forte):* O mistério da caça ao novo planeta e a gamificação de ciência cidadã.
- **📡 Dados & Satélites Oficiais:** SPHEREx Simulation Archive, WISE/NEOWISE Infrared Survey e NASA Planetary Data System (PDS).
- **✅ Prós:** Astronomia observacional pura de última geração; grande engajamento público.
- **❌ Contras:** Manipulação de cabeçalhos WCS e arquivos .FITS assusta quem nunca lidou com astronomia.
- **🚨 Alerta 48h:** Use a técnica do *Blink Comparator* (alternância rápida entre duas fotos para fazer o objeto móvel "pular" na tela). É simples de programar e encanta qualquer jurado.
- **💡 O Pulo do Gato:** *SPHEREx Sky Hunter*: plataforma gamificada onde o usuário pisca imagens infravermelhas e marca anomalias em movimento, gerando um relatório astrométrico automático para submissão à NASA.

---

### 13. Space Mission Design Game
- **🎯 Contexto Real da NASA:** Toda missão espacial é um quebra-cabeça de compromissos brutais: adicionar mais instrumentos científicos exige mais combustível, o que encarece o foguete e pode estourar o orçamento do Congresso americano. A NASA quer um jogo que ensine a arte do trade-off de engenharia de sistemas.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & Gamedev (Esforço 5/5 - Crítico):* React/Vue, Tailwind CSS, animações de balanço de massa e estética de terminal de lançamento da NASA.
  - *Backend & Dados (Esforço 2/5 - Leve):* Economia do jogo rodando no navegador em TypeScript/JavaScript.
  - *Ciência & Domínio (Esforço 3/5 - Médio):* Engenharia de sistemas, delta-V básico, geração de watts e confiabilidade de componentes.
  - *Storytelling & Pitch (Esforço 5/5 - Crítico):* Humor, dilemas éticos de corte de custos e tensão no momento da contagem regressiva.
- **📡 Dados & Satélites Oficiais:** NASA Cost Estimating Handbook, NASA Systems Engineering Handbook e especificações de foguetes do Launch Services Program.
- **✅ Prós:** O projeto mais divertido e viciante da maratona; altíssimo engajamento dos jurados.
- **❌ Contras:** Tentar criar física 3D orbital em tempo real (estilo Kerbal Space Program) é garantia de não terminar o projeto.
- **🚨 Alerta 48h:** Crie um jogo de tomada de decisões táticas baseadas em turnos/cartas (estilo *Reigns* ou simulador de gerenciamento).
- **💡 O Pulo do Gato:** *Director: Mission to Enceladus*: o jogador tem 800 milhões de dólares e 5 minutos para montar uma missão para buscar vida em Encélado. Cada decisão (reator nuclear vs solar, furador de gelo vs espectrômetro) altera a probabilidade de explosão no lançamento e o retorno de dados científicos.

---

### 14. The Earth Information Jukebox
- **🎯 Contexto Real da NASA:** Bilhões de pessoas interagem com dados climáticos da NASA por gráficos visuais, mas deficientes visuais são excluídos desse conhecimento. A sonificação de dados converte variáveis físicas (temperatura, vento, correntes marítimas) em frequências e ritmos sonoros, democratizando o acesso e criando empatia imediata com o planeta.
- **🛠️ Matriz de Habilidades Exigidas:**
  - *Frontend & Áudio (Esforço 4/5 - Forte):* Web Audio API, Tone.js, sintetizadores virtuais no navegador e acessibilidade WCAG (leitores de tela).
  - *Backend & Dados (Esforço 2/5 - Leve):* Normalização de séries temporais climáticas para frequências audíveis em Hertz.
  - *Ciência & Domínio (Esforço 3/5 - Médio):* Escalas musicais (maiores/menores), síntese sonora e anomalias de aquecimento global.
  - *Storytelling & Pitch (Esforço 5/5 - Crítico):* Inclusão de deficientes visuais na ciência e demonstração com fones de ouvido no pitch.
- **📡 Dados & Satélites Oficiais:** NASA GISTEMP (temperatura global), OCO-2/OCO-3 (CO2 atmosférico) e NOAA/NASA Coral Reef Watch.
- **✅ Prós:** Originalidade extrema (pouquíssimas equipes fazem som); nota 10 garantida em acessibilidade e empatia.
- **❌ Contras:** Se soar como ruído desconexo, perde credibilidade científica.
- **🚨 Alerta 48h:** Mapeie métricas reais em notas musicais harmônicas: anos frios soam como notas graves de violoncelo, enquanto picos recentes de aquecimento sobem para tons agudos e percussão acelerada.
- **💡 O Pulo do Gato:** *Symphony of a Changing Planet*: jukebox climática 100% acessível para deficientes visuais que toca a história climática da Terra de 1880 a 2026 como uma suíte orquestral gerativa, permitindo aos usuários 'ouvir' o aquecimento global com descrição em áudio integrada.

---

## 🎯 Roteiro Prático para a Decisão Hoje:

1. Inicie o servidor local: `python3 server.py`
2. Abra `http://localhost:8080` e mande o link para seu amigo.
3. Leiam os dossiês detalhados nos cards clicando em **"Abrir Dossiê Estratégico Completo"**.
4. Cada um dá suas notas de 1 a 5 estrelas.
5. O painel apontará o **Desafio de Alto Consenso** da equipe!
