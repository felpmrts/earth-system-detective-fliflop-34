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
3. A área Mapa mostra a seleção e o período. O mapa da PROD-1 será integrado nessa área para associar uma região a cada lado.
4. A Bancada pode ser aberta pela navegação ou pelo botão da demonstração. Hoje ela lê a fixture local e filtra por variável e período. Na integração final, a tela deve chamar a API após a confirmação das duas regiões e do período.

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
| `src/geo/gridGeometry.ts`           | Geometria, encaixe na grade nativa e composição de até nove células conectadas.                     |
| `src/map/`                          | Estilos cartográficos e configuração da legenda.                                                     |
| `src/services/regionDataAdapter.ts` | Acesso a grades e análises, validação, timeout e fallback local.                                     |
| `src/services/idbCache.ts`          | Persistência de análises no IndexedDB.                                                                |
| `public/data/`                      | Grades pré-processadas e fixture sintética da bancada.                                                |
| `src/__tests__/`                    | Testes do contrato, da geometria, da legenda e do adaptador.                                            |

## Integração com PROD-1 e Dados

A tela de exploração coordena o fluxo. O mapa recebe a variável pertinente a A ou B e devolve a seleção espacial tipada. As células de uma região seguem o modelo e a resolução daquela variável. Leaflet usa latitude/longitude, enquanto GeoJSON usa longitude/latitude. Confira os detalhes no [contrato da PROD-1](../context/knowledge_maps/CONTRATO_FRONTEND_PROD1.md).

O [contrato de dados](../CONTRATO_DE_DADOS.md) define `POST /api/analyze` com variáveis, regiões e datas mensais e uma resposta com análise de A, análise de B opcional e métricas de comparação. O backend agrega células, consulta as fontes e calcula as estatísticas. O navegador usa os valores já calculados. `series.linear_fit` alimenta OLS e a série opcional `sen_fit` alimenta Theil–Sen quando disponível. No mapa global, direção, magnitude e significância são dimensões distintas da legenda.

### Configuração de dados e offline

Copie `.env.example` para `.env.local` quando precisar configurar o adaptador. `VITE_DATA_MODE=offline` usa arquivos locais e `VITE_DATA_MODE=api` usa `VITE_API_BASE_URL` (exemplo local `http://localhost:8000`). Variáveis `VITE_*` são públicas. Guarde credenciais no backend.

O adaptador contempla cache e fallback, mas a bancada atual busca `public/data/mock_analysis.json` diretamente. Alterar a configuração do adaptador, por si só, ainda não conecta a tela à API. O mock tem duas séries sintéticas de 2000 a 2009 e as respectivas tendências. A interface indica quando a variável ou o período escolhido não está coberto. A demo pode ser servida localmente sem consultar NASA ou Python.

## Verificação antes de integrar

- Rode a checagem de tipos, os testes e o build.
- Valide os seletores A/B no desktop e no celular, incluindo busca, limpeza, nomes longos e meses nos limites.
- Confira as séries com A/B invertidos, duas unidades, série indisponível, período sem pontos e alternância entre bruto e anomalia.
- Na integração do mapa, confira o encaixe geográfico, as células A/B e a preservação do estado ao alternar abas.
- Na integração da API, confirme payloads de sucesso, ausência de dados, timeout e fallback offline.

Desenvolvimento de interface ocorre em `frontend`, com integração em `develop` e produção em `main`. O mapa interativo, o disparo da análise pelo fluxo completo e o painel do copiloto ainda dependem de integração. Veja também a [decisão de stack](../general_strategy/STACK_FRONTEND.md).
