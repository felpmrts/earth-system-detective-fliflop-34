# Earth System Trend Detective — Project FlipFlop-34

> **NASA International Space Apps Challenge 2026** · Desafio *Be An Earth System Trend Detective!*  
> *(Documentação inicial v1 — base pública para reprodução local, testes e integração contínua).*

O **Earth System Trend Detective** transforma séries climáticas multidecadais da NASA, NOAA e Copernicus em diagnósticos visuais, geoespaciais e estatisticamente auditados, respondendo às **4 Perguntas do Detetive** para qualquer ponto ou região comparada do planeta:

1. **O QUE está mudando?** Série bruta vs. anomalia climatológica mensal (sem ciclo sazonal) e regime não-linear (GAM/Spline e aceleração $B_2$).
2. **ONDE está mudando?** Mapa interativo Canvas com grade pré-processada global ($q_{\text{FDR}} < 0{,}05$) e comparador A × B com modo **Mesmo Local (`A=B`)** e *re-snap* entre grades (`MERRA-2` $0{,}5^\circ \times 0{,}625^\circ$ e `CERES_SYN1deg` $1{,}0^\circ \times 1{,}0^\circ$).
3. **QUANTO está mudando?** Taxa de variação por década ajustada sobre toda a nuvem de pontos (**Theil–Sen** robusto com IC 95% e **OLS**), respeitando escalas intervalares (proibido `%` em $^\circ\text{C}$, $\text{kPa}$, etc.).
4. **É estatisticamente significativo?** Correção para autocorrelação temporal **$\text{AR}(1)$** ($N_{\text{efetivo}}$), controle de falsas descobertas (**Benjamini–Hochberg FDR**) e detecção bivariada de extremos por **Distância de Mahalanobis ($D_M > 2{,}5$)**.

---

## Os 7 Invariantes Estatísticos do Projeto

1. Proibido calcular tendência como ponto final menos ponto inicial ($Y_{\text{fim}} - Y_{\text{início}}$).
2. Regressões aplicadas apenas sobre **anomalias climatológicas mensais** (remoção de sazonalidade — Princípio Henrietta Leavitt).
3. Proibição absoluta de variação percentual (`%`) em variáveis de **escala intervalar**.
4. Separação clara entre magnitude da inclinação ($B$) e força do acoplamento ($r$, $\tau$, $R^2$).
5. Decomposição multiescala entre correlação secular de longo prazo ($r_{\text{global}}$) e oscilação residual de curto prazo ($r_{\text{detrended}}$).
6. Modelagem não-linear suave (**GAM / Smoothing Spline**) em vez de polinômios livres de grau alto.
7. Identificação de extremos via **Elipse de Mahalanobis ($D_M > 2{,}5$)** e significância corrigida por **$\text{AR}(1)$ + FDR ($q < 0{,}05$)**.

---

## Estrutura do Repositório

| Diretório / Arquivo | Função |
| :--- | :--- |
| `frontend/` | Aplicação web React + TypeScript + Vite + Mantine + Leaflet (Canvas) + Plotly.js, Tutorial HUD de 8 passos, camadas globais offline em `public/data/`, painel do Co-Piloto, testes Vitest e suíte E2E Playwright. |
| `backend/` | Motor estatístico State-of-the-Art (`stats_engine.py`: GCV Spline/LOWESS, `MinCovDet` Mahalanobis, Santer `AR(1)` + Hamed-Rao + BH FDR), Chatbot Co-Piloto agêntico (`copilot_engine.py` + `copilot_tools.py` com Gemini / OpenRouter), Motor de Descoberta (`discovery_engine.py` / `ml_discovery.py`) e `requirements.txt`. |
| `data/` | Camada de dados e API REST (`data.api.server`): catálogo das 7 Famílias Ambientais (42 variáveis), conectores multi-API, cache em disco, serviço de comparação (`comparison_service.py` delegando ao `backend/stats_engine.py`) e testes de contrato. |
| `context/` | Base de conhecimento científica, especificações de APIs NASA/NOAA/GloFAS, mapas e guias operacionais. |
| `.github/workflows/ci.yml` | Pipeline CI do GitHub Actions (`backend/` + `data/tests/`, typecheck, homologação de grades, auditoria offline e testes E2E Playwright). |
| `CONTRATO_DE_DADOS.md` | Contrato JSON congelado (`RegionAnalysisRequest -> RegionAnalysisResponse`). |
| `DATA_SOURCES.md` | Inventário de fontes de dados, resoluções espaciais, pré-processamento e citações oficiais. |
| `00_MASTER_CONTEXT_AND_ROUTER.md` | Ponto de entrada arquitetural e roteador interno de documentação. |

---

## Como Executar Localmente

### Pré-requisitos
- **Python 3.10+** com `pip` / `venv` (dependências do motor estatístico em `backend/requirements.txt`: `numpy`, `scipy`, `scikit-learn`)
- **Node.js 22+** e **npm**

### 1. Subir o Backend (`http://127.0.0.1:8000`)

Na raiz do repositório:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Opcional: copiar template de credenciais (OpenRouter / Gemini para Co-Piloto e NOAA/AppEEARS/Giovanni)
cp data/.env.example data/.env

PYTHONPATH=. python3 -m data.api.server --host 127.0.0.1 --port 8000
```

Endpoints principais: `GET /api/health`, `GET /api/catalog`, `POST /api/analyze`, `POST /api/copilot`, `POST /api/discover`, `POST /api/compare`.

### 2. Subir o Frontend (`http://127.0.0.1:5173`)

Em outro terminal:

```bash
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

### Modo 100% Offline (Contingência de Demonstração)

Para rodar sem backend nem internet, utilize `VITE_DATA_MODE=offline` em `frontend/.env.local` (baseado em `frontend/.env.example`):

```bash
cd frontend
npm run build
npm run verify:offline
npm run preview
```

---

## Testes e Auditoria

### Frontend (Typecheck, Grids, Unitários, Bundle Offline e E2E real)

```bash
cd frontend
npm run typecheck         # Checagem estrita TypeScript (tsc --noEmit)
npm run validate:grids    # Homologação estrutural e estatística das 12 grades globais
npm run build             # Build de produção em dist/
npm test                  # Suíte unitária (Vitest; inclui auditoria de dist/)
npm run verify:offline    # Auditoria de 0 CDNs externas e integridade offline em dist/
npm run test:e2e          # Suíte Playwright em navegador real contra vite preview
```

> Para executar o `npm run test:e2e` em Linux/CI pela primeira vez: `npx playwright install --with-deps chromium`.

### Backend (`backend/` + `data/`)

```bash
PYTHONPATH=. python3 -B -m unittest discover -s backend -p "test_*.py" -v
PYTHONPATH=. python3 -B -m unittest discover -s data/tests -p "test_*.py" -v
```
