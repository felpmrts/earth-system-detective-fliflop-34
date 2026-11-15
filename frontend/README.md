# Frontend — Earth System Trend Detective

Este guia descreve como executar, manter e integrar a aplicação web. A stack usa React, TypeScript, Vite, Mantine para controles e Plotly.js para gráficos. O build estático pode ser publicado na Vercel com `frontend/` como diretório raiz.

## Ambiente local

Use Node.js compatível com o Vite instalado e npm. Na raiz do repositório:

```powershell
cd frontend
npm ci
npm run dev
```

Abra o endereço indicado pelo Vite. Para verificar alterações, execute `npm run typecheck`, `npm test` e `npm run build`. O build gera `frontend/dist/`. Use `npm run preview` para servir esse build localmente. Para homologar os 12 arquivos `{var_id}_grid.json` reais em `public/data/`, execute `npm run validate:grids -- --strict` (modo parcial sem `--strict` valida apenas os arquivos presentes e o alias `CLOUD_AMT -> CLDTOT_grid.json`).

## Jornada e estado

1. Escolha as variáveis A e B nos seletores agrupados por família. Os dois lados podem usar a mesma variável.
2. Selecione o mês inicial e o mês final. O início mínimo vem do maior ano inicial entre as duas variáveis. O limite superior é o mês corrente. A cobertura efetiva depende da consulta.
3. A área Mapa usa NASA GIBS no Leaflet. Escolha o lado ativo e clique nas células para compor as regiões A e B (ou ative **Mesmo Local (A=B)** para espelhar A em B — com *re-snap* automático e deduplicação quando `MERRA-2` `0.5°×0.625°` e `CERES_SYN1deg` `1.0°×1.0°` diferirem). O limite de células conexas por região é variável e configurável via `VITE_MAX_CELLS_PER_REGION` (padrão `25`, equivalente a `5×5`), podendo ser alterado a qualquer momento.
4. `Analisar seleção` envia uma única requisição `POST /api/analyze` depois que variáveis, período e regiões A/B estão completos. A Bancada recebe a resposta real e apresenta o erro do backend sem substituir silenciosamente a consulta por dados sintéticos.

O estado está em `src/App.tsx`. A aplicação inicia na aba Mapa e mantém as escolhas durante a troca de abas. Os controles de gráficos alternam série bruta e anomalia, curvas juntas e separadas, eixo Y duplo e tendências OLS/Theil–Sen. Unidades diferentes são separadas quando o eixo duplo está desativado. O recorte temporal preserva o alinhamento entre datas, valores e tendências e limita a navegação horizontal. O recorte usa os ajustes pré-calculados da fixture, válidos para o período original da análise.

## Catálogo ambiental

`src/contracts/environmentalFamilies.json` é um recorte de apresentação do catálogo Python `data/catalog/environmental_catalog.py` da branch `data`, revisão `00efd67`. Preserva os nomes, códigos e a ordem das sete famílias e das 42 entradas. As opções que ainda não têm suporte no contrato operacional do frontend aparecem desabilitadas. A entrada legada `CLDTOT` permanece disponível na família de radiação e atmosfera para preservar o contrato atual. Dados também cadastra `CLOUD_AMT` como código distinto, cuja adoção depende de alinhar mapa, catálogo operacional e API.

Ao atualizar as famílias, confira se todos os códigos em `src/contracts/catalog.ts` continuam acessíveis. Esse arquivo concentra metadados operacionais, como unidade, resolução de grade, modelo, ano inicial e máscara terrestre. Novas fontes podem exigir metadados e regras espaciais próprios antes de serem habilitadas.

## Organização do código

| Caminho                               | Responsabilidade                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                      | Inicializa React e o tema escuro do Mantine com locale pt-BR para datas.                                |
| `src/App.tsx` e `src/bench.css`   | Estado de exploração, seletores, navegação, painel reservado ao mapa, gráfico e layout responsivo. |
| `src/contracts/`                    | Tipos da consulta e da resposta, catálogo, famílias e validação do payload.                         |
| `src/geo/gridGeometry.ts`           | Geometria, encaixe na grade nativa e composição de células conectadas (limite configurável via `VITE_MAX_CELLS_PER_REGION`, padrão `25`). |
| `src/map/`                          | Mapa React/Leaflet, camadas NASA GIBS e OSM, seleção A/B, estilos e legenda.                           |
| `src/services/regionDataAdapter.ts` | Catálogo do backend, análises reais, validação, timeout, cache e modo offline explícito.             |
| `src/services/idbCache.ts`          | Persistência de análises no IndexedDB.                                                                |
| `public/data/`                      | Grades pré-processadas e fixture sintética da bancada.                                                |
| `src/__tests__/`                    | Testes do contrato, da geometria, da legenda e do adaptador.                                            |

## Integração com PROD-1 e Dados

A tela de exploração coordena o fluxo. O mapa recebe a variável pertinente a A ou B e devolve a seleção espacial tipada. As células de uma região seguem o modelo e a resolução daquela variável. Leaflet usa latitude/longitude, enquanto GeoJSON usa longitude/latitude. Confira os detalhes no [contrato da PROD-1](../context/knowledge_maps/CONTRATO_FRONTEND_PROD1.md).

O [contrato de dados](../CONTRATO_DE_DADOS.md) define `POST /api/analyze` com variáveis, regiões e datas mensais e uma resposta com análise de A, análise de B opcional e métricas de comparação. O backend agrega células, consulta as fontes e calcula as estatísticas. O navegador usa os valores já calculados. `series.linear_fit` alimenta OLS e a série opcional `sen_fit` alimenta Theil–Sen quando disponível. No mapa global, direção, magnitude e significância são dimensões distintas da legenda.

### Configuração de dados e offline

O modo padrão é `api`. Copie `.env.example` para `.env.local` quando precisar ajustar configurações locais. `VITE_DATA_MODE=offline` ativa deliberadamente os arquivos sintéticos locais; `VITE_DATA_MODE=api` usa `VITE_API_BASE_URL` (exemplo local `http://localhost:8000`). O limite máximo de células por região é variável e definido por `VITE_MAX_CELLS_PER_REGION` (padrão `25`), podendo ser alterado a qualquer momento no `.env.local` (ou ambiente) — mantenha-o alinhado com `MAX_CELLS_PER_REGION` no backend. Variáveis `VITE_*` são públicas. Guarde credenciais no backend.

O front carrega famílias e disponibilidade por `GET /api/catalog`. As 22 variáveis NASA POWER em modo `realtime` ficam habilitadas; conectores de fila, demonstração ou que dependem de outras credenciais permanecem indisponíveis. Na confirmação final, o adaptador chama `POST /api/analyze`, valida a resposta e grava o resultado no IndexedDB. Em modo API, falhas são exibidas como falhas reais. O mock é usado somente quando `VITE_DATA_MODE=offline` é configurado explicitamente.

Para executar a integração local completa, inicie os dois processos em terminais separados:

```powershell
python -m data.api.server --port 8000
cd frontend
npm run dev
```

O backend espera meses no formato `YYYY-MM`. O front converte a seleção do Mantine para esse contrato e mantém datas completas apenas na apresentação do eixo do gráfico.

## Verificação antes de integrar

- Rode a checagem de tipos, os testes e o build.
- Valide os seletores A/B no desktop e no celular, incluindo busca, limpeza, nomes longos e meses nos limites.
- Confira as séries com A/B invertidos, duas unidades, série indisponível, período sem pontos e alternância entre bruto e anomalia.
- Confira o encaixe geográfico, as células A/B, o limite de células configurado (`VITE_MAX_CELLS_PER_REGION`) e a preservação do estado ao alternar abas.
- Na integração da API, confirme payloads de sucesso, ausência de dados, timeout, erro explícito e modo offline deliberado.

Desenvolvimento de interface ocorre em `frontend`, com integração em `develop` e produção em `main`. O mapa alimenta o estado espacial A/B e a chamada real ao backend já ocorre após `Analisar seleção`. O painel do copiloto ainda depende de integração. Veja também a [decisão de stack](../context/general_strategy/STACK_FRONTEND.md).
