# Frontend — Earth System Trend Detective

Este guia descreve como executar, manter e integrar a aplicação web. A stack usa React, TypeScript, Vite, Mantine para controles e Plotly.js para gráficos. O build estático pode ser publicado na Vercel com `frontend/` como diretório raiz.

## Ambiente local

Use Node.js compatível com o Vite instalado e npm. Na raiz do repositório:

```powershell
cd frontend
npm ci
npm run dev
```

Abra o endereço indicado pelo Vite. Para verificar alterações, execute `npm run typecheck`, `npm test` e `npm run build`. O build gera `frontend/dist/`. Use `npm run preview` para servir esse build localmente.

## Jornada e estado

1. Escolha as variáveis A e B nos seletores agrupados por família. Os dois lados podem usar a mesma variável.
2. Selecione o mês inicial e o mês final. O início mínimo vem do maior ano inicial entre as duas variáveis. O limite superior é o mês corrente. A cobertura efetiva depende da consulta.
3. A área **Mapa** renderiza `MapCanvas` + `MapView` (Leaflet Canvas), carrega as 6 grades globais (`T2M`, `GWETTOP`, `T2M_MAX`, `PRECTOTCORR`, `ALLSKY_SFC_SW_DWN`, `CLDTOT`), oferece 3 atalhos de **Story Presets** (*Caso 1 · Cerrado vs. Pantanal*, *Caso 2 · Amazônia Radiação × Nuvens* e *Caso 3 · Semiárido vs. Sul*) e dispara `getRegionData(...)` conforme as células A/B são compostas, exibindo estado de carregamento e toasts semânticos (`mapErrorToNotification`).
4. A **Bancada científica** plota série bruta ou anomalia, ajustes OLS e Theil–Sen, curva não-linear GAM, marcadores de eventos extremos (`Mahalanobis`), além do painel **"4 Respostas do Detetive"** e do card de comparação multiescala (`comparison_pair`). Suporta também comparação espacial da mesma variável (`variableA === variableB`) entre Região A e Região B.

O estado está em `src/App.tsx`. A aplicação inicia na aba Mapa e mantém as variáveis e o período durante a troca de abas. Os controles de gráficos alternam série bruta e anomalia, curvas juntas e separadas, eixo Y duplo, tendências OLS/Theil–Sen e camada GAM + Mahalanobis. Unidades diferentes são separadas quando o eixo duplo está desativado. O recorte temporal preserva o alinhamento entre datas, valores, tendências e outliers, limitando a navegação horizontal.

## Catálogo ambiental

`src/contracts/environmentalFamilies.json` é um recorte de apresentação do catálogo Python `data/catalog/environmental_catalog.py` da branch `data`, revisão `00efd67`. Preserva os nomes, códigos e a ordem das sete famílias e das 42 entradas. As opções que ainda não têm suporte no contrato operacional do frontend aparecem desabilitadas. A entrada legada `CLDTOT` permanece disponível na família de radiação e atmosfera para preservar o contrato atual. Dados também cadastra `CLOUD_AMT` como código distinto, cuja adoção depende de alinhar mapa, catálogo operacional e API.

Ao atualizar as famílias, confira se todos os códigos em `src/contracts/catalog.ts` continuam acessíveis. Esse arquivo concentra metadados operacionais, como unidade, resolução de grade, modelo, ano inicial e máscara terrestre. Novas fontes podem exigir metadados e regras espaciais próprios antes de serem habilitadas.

## Organização do código

| Caminho                               | Responsabilidade                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                      | Inicializa React e o tema escuro do Mantine com locale pt-BR para datas.                                |
| `src/App.tsx` e `src/bench.css`   | Estado de exploração, seletores, navegação, painel reservado ao mapa, gráfico e layout responsivo. |
| `src/contracts/`                    | Tipos da consulta e da resposta, catálogo, famílias e validação do payload.                         |
| `src/geo/gridGeometry.ts`           | Geometria, encaixe na grade nativa e composição de até nove células conectadas.                     |
| `src/map/`                          | Estilos cartográficos e configuração da legenda.                                                     |
| `src/services/regionDataAdapter.ts` | Acesso a grades e análises, validação, timeout e fallback local.                                     |
| `src/services/idbCache.ts`          | Persistência de análises no IndexedDB.                                                                |
| `public/data/`                      | 6 grades globais pré-processadas (`*_grid.json`) e fixture `mock_analysis.json`.                     |
| `src/__tests__/`                    | 6 suítes de testes do contrato, geometria, legenda, mapa integrado, adaptador e walking skeleton.     |

## Integração com PROD-1 e Dados

A tela de exploração coordena o fluxo. O mapa recebe a variável pertinente a A ou B e devolve a seleção espacial tipada. As células de uma região seguem o modelo e a resolução daquela variável. Leaflet usa latitude/longitude, enquanto GeoJSON usa longitude/latitude. Confira os detalhes no [contrato da PROD-1](../context/knowledge_maps/CONTRATO_FRONTEND_PROD1.md).

O [contrato de dados](../CONTRATO_DE_DADOS.md) define `POST /api/analyze` (exposto em `data/api/server.py` e `analyze_region_contract` em `data/services/comparison_service.py`) com variáveis, regiões e datas mensais, retornando análise de A (`fdr_q_value`, `is_significant_fdr05`, `sen_fit`, `gam_smooth_fit`, `outliers_mahalanobis`), análise de B opcional, métricas multiescala (`comparison_pair`) e erro semântico HTTP `422 OCEAN_MASK_NO_DATA`. `series.linear_fit` alimenta OLS, `sen_fit` alimenta Theil–Sen e `gam_smooth_fit` alimenta GAM. No mapa global, direção, magnitude e significância são dimensões distintas da legenda.

### Configuração de dados e offline

Copie `.env.example` para `.env.local` quando precisar configurar o adaptador. `VITE_DATA_MODE=offline` usa arquivos locais (`public/data/*_grid.json` e `mock_analysis.json`) e `VITE_DATA_MODE=api` usa `VITE_API_BASE_URL` (exemplo local `http://localhost:8000` apontando para `python -m data.api.server --port 8000`). Variáveis `VITE_*` são públicas. Guarde credenciais no backend.

A tela chama `getRegionData(...)` automaticamente ao compor células no mapa ou acionar um dos 3 Story Presets, utilizando o cache IndexedDB (`RegionAnalysisCache`), fallback offline para demonstração e exposição de erros reais da API via `mapErrorToNotification`.

## Verificação antes de integrar

- Rode a checagem de tipos, os testes e o build.
- Valide os seletores A/B no desktop e no celular, incluindo busca, limpeza, nomes longos e meses nos limites.
- Confira as séries com A/B invertidos, duas unidades, série indisponível, período sem pontos e alternância entre bruto e anomalia.
- Na integração do mapa, confira o encaixe geográfico, as células A/B e a preservação do estado ao alternar abas.
- Na integração da API, confirme payloads de sucesso, ausência de dados, timeout e fallback offline.

Desenvolvimento de interface ocorre em `frontend`, com integração em `develop` e produção em `main`. O mapa interativo, o disparo da análise pelo fluxo completo e o painel do copiloto ainda dependem de integração. Veja também a [decisão de stack](../general_strategy/STACK_FRONTEND.md).
