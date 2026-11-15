# Handoff Técnico QA — Itens Exclusivos da Frente `PROD-2` (Branch `frontend`)

- **Escopo:** Documentação cirúrgica dos **10 achados restantes** da auditoria somente-leitura (`AUD-01`, `AUD-02`, `AUD-03`, `AUD-05`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`), aplicáveis diretamente nos arquivos de responsabilidade da **`PROD-2`** na branch `frontend` (base alinhada a `223d3b9` / `origin/mapa` `8530d8a`).
- **Isolamento de conflitos:** Os 5 achados exclusivos da **`PROD-1`** (`AUD-04`, `AUD-06`, `AUD-07`, `AUD-08`, `AUD-09`) já foram tratados separadamente na branch `mapa` (`MapWorkspace.tsx` e `gridGeometry.ts`). **Nenhuma correção abaixo precisa editar `MapWorkspace.tsx` ou `gridGeometry.ts`**, garantindo merge limpo entre `frontend` e `mapa`.

---

## 1. Sumário Executivo por Severidade

| ID | Severidade | Arquivo(s) | Risco Principal |
| :--- | :---: | :--- | :--- |
| `AUD-01` | **Crítico** | `frontend/src/App.tsx`, `frontend/src/bench.css` | **Bloqueio Mobile 4G:** dropdowns e datepickers abrem atrás do drawer (`zIndex: 1100` < `1200`). |
| `AUD-02` | **Crítico** | `frontend/src/App.tsx` | **Race condition:** troca de seleção durante requisição em andamento não aborta nem descarta resposta antiga. |
| `AUD-03` | **Crítico** | `frontend/src/services/sessionState.ts`, `frontend/src/bench/ScientificBench.tsx` | **Crash no boot/render:** `localStorage` com `cells` corrompido ou mês inválido (`"2020-99"`) derruba o React. |
| `AUD-05` | **Médio** | `frontend/src/App.tsx` | Troca de aba (`Mapa` ↔ `Bancada`) desmonta `MapWorkspace` e destrói modo `Mesmo Local (A=B)`. |
| `AUD-10` | **Médio** | `frontend/src/contracts/contractValidator.ts`, `frontend/src/bench/ScientificBench.tsx` | Campos numéricos/enums não validados no contrato podem gerar `TypeError` em badges e `.toFixed()`. |
| `AUD-11` | **Médio** | `frontend/src/bench.css` | IDs longos (`region_a_id`/`region_b_id` com até 25 células) estouram o Card 4 no desktop e `375px`. |
| `AUD-12` | **Médio** | `frontend/src/bench.css` | Em `375px`, `.map-status` não quebra linha e `.map-legend` colide com atribuição/camadas Leaflet. |
| `AUD-13` | **Médio** | `frontend/src/bench/benchMeta.ts`, `frontend/src/bench/ScientificBench.tsx` | Valores próximos de zero exibem `"-0.000"`/`"-0.00"`, e `OLS`/`A₀`/`Δ Declive` omitem unidades. |
| `AUD-14` | **Polimento** | `frontend/src/contracts/catalog.ts` | `CLOUD_AMT` (`unit: '%'`, alias de `CLDTOT`) permite `%` (`allow_percentage_change: true`). |
| `AUD-15` | **Polimento** | `frontend/src/bench/ScientificBench.tsx` | Margens fixas `l: 75, r: 75` reduzem demais a área útil dos gráficos Plotly em `375px`. |

---

## 2. Especificação Cirúrgica dos 10 Itens

### `AUD-01` — Portals do Mantine (`Select` / `MonthPickerInput`) ocultos atrás do Drawer Mobile

- **Severidade:** **Crítico (Bloqueador para teste cego Mobile 4G — Portão 5)**
- **Arquivo e linhas:**
  - `frontend/src/App.tsx`: linhas **219**, **226** e **231**
  - Referência de z-index em `frontend/src/bench.css`: linhas **44–45** (`.drawer-backdrop` = `z-index: 1150`; `.workspace > aside` = `z-index: 1200`)
- **Bug e impacto:** No breakpoint `@media (max-width: 700px)` (ex.: celular `375px` no teste 4G), o usuário abre o drawer lateral `"Variáveis e período"` (`z-index: 1200`), mas os portais do Mantine (`withinPortal: true`) são renderizados com `zIndex: 1100`. O menu de seleção de Variável A/B e os seletores de mês abrem atrás do backdrop escuro (`1150`) e do painel (`1200`), tornando impossível selecionar variáveis ou datas pelo celular.

**Trecho atual (`frontend/src/App.tsx:218-234`):**
```tsx
              value={value || null} onChange={id => onChange(id ?? '')}
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: 1100 }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Período</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês inicial" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês final" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1100 }}
              minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
          </fieldset>
```

**Substituição:** alterar os três `zIndex: 1100` para **`zIndex: 1300`** (acima de `.workspace > aside` `1200`).

```tsx
              value={value || null} onChange={id => onChange(id ?? '')}
              comboboxProps={{ width: 310, position: 'bottom-start', withinPortal: true, zIndex: 1300 }}
              maxDropdownHeight={340} />
          ))}
          <fieldset className="period-picker" disabled={!minimumMonth}>
            <legend>Período</legend>
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês inicial" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1300 }}
              minDate={minimumMonth ? minimumMonth + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={start ? start + '-01' : null} onChange={value => setStartMonth(value?.slice(0, 7) ?? '')} />
            <MonthPickerInput className="variable-picker" classNames={{ input: 'selection-input' }} label="Mês final" placeholder="Selecione o mês"
              locale="pt-br" valueFormat="MMMM [de] YYYY" clearable disabled={!minimumMonth}
              popoverProps={{ withinPortal: true, zIndex: 1300 }}
              minDate={minimumMonth ? (start || minimumMonth) + '-01' : undefined} maxDate={maximumMonth + '-01'}
              value={end ? end + '-01' : null} onChange={value => setEndMonth(value?.slice(0, 7) ?? '')} />
          </fieldset>
```

---

### `AUD-02` — Race Condition em `analyzeSelection()` ao Alterar Parâmetros com Requisição Ativa

- **Severidade:** **Crítico**
- **Arquivo e linhas:** `frontend/src/App.tsx`: linhas **85–89** e **130–152**
- **Bug e impacto:** Enquanto `isAnalyzing === true`, o painel lateral e o mapa permanecem clicáveis. Se o usuário mudar variável, período ou célula no mapa durante a consulta em 4G/rede lenta, o `useEffect` (`L85-89`) limpa `analysis`, mas **não aborta** `analysisControllerRef.current`. Além disso, em `L140-142`, `setAnalysis(result)`, `setAnalyzedAt(...)` e `setTab('bench')` executam sem checar `controller.signal.aborted`. Quando a requisição antiga resolve depois, ela grava resultados obsoletos e força mudança para a aba da bancada em desacordo com os controles atuais.

**Trecho atual (`frontend/src/App.tsx:84-89`):**
```tsx
  // Qualquer mudança no formulário espacial/temporal invalida a análise anterior.
  useEffect(() => {
    setAnalysis(undefined);
    setAnalyzedAt(null);
    setAnalysisError('');
  }, [variableA, variableB, start, end, regionA, regionB]);
```

**Substituição 1 (`L84-89`):**
```tsx
  // Qualquer mudança no formulário espacial/temporal invalida e aborta a análise anterior em voo.
  useEffect(() => {
    analysisControllerRef.current?.abort('Seleção alterada durante a consulta.');
    setAnalysis(undefined);
    setAnalyzedAt(null);
    setAnalysisError('');
  }, [variableA, variableB, start, end, regionA, regionB]);
```

**Trecho atual (`frontend/src/App.tsx:130-153`):**
```tsx
    try {
      const result = await getRegionData({
        variable: variableA as VariableId,
        variableB: variableB as VariableId,
        region: regionA,
        regionB,
        startDate: start,
        endDate: end,
        signal: controller.signal,
      });
      setAnalysis(result);
      setAnalyzedAt(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setAnalysisError(requestError instanceof Error ? requestError.message : 'Não foi possível analisar a seleção.');
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
```

**Substituição 2 (`L139-143`):**
```tsx
      if (controller.signal.aborted) return;
      setAnalysis(result);
      setAnalyzedAt(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));
      setTab('bench');
```

---

### `AUD-03` — Crash por Sessão Parcialmente Corrompida no `localStorage` (`cells` / `startMonth`)

- **Severidade:** **Crítico**
- **Arquivo e linhas:**
  - `frontend/src/services/sessionState.ts`: linhas **38–49** e **74–75**
  - Guarda defensiva complementar em `frontend/src/bench/ScientificBench.tsx`: linhas **241–244**
- **Bug e impacto:** `isValidRegion` só verifica se `cells` é array com `length` entre `1` e `MAX_CELLS_PER_REGION`, sem validar os elementos de `cells` (`lat`, `lon`, `bounds_leaflet`, `cell_id`) nem se `source_model` ainda coincide com o catálogo atual. Um payload antigo/corrompido (`cells: [{}]`) passa `isValidRegion` e quebra `MapWorkspace` em `cell.bounds_leaflet[0][0]`. Ademais, `startMonth`/`endMonth` aceitam qualquer string: uma string como `"2020-99"` passa a comparação lexicográfica (`App.tsx:53-54`) e lança `RangeError: Invalid time value` não tratado em `Intl.DateTimeFormat().format(...)` (`MapWorkspace.tsx:600`) e `new Date(...).toISOString()` (`ScientificBench.tsx:243`).

**Trecho atual (`frontend/src/services/sessionState.ts:1,38-49,74-77`):**
```ts
import { isValidVariableId } from '../contracts/catalog';
...
function isValidRegion(value: unknown, expectedSlot: 'A' | 'B'): value is RegionSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegionSelection>;
  return (
    candidate.slot === expectedSlot &&
    typeof candidate.region_id === 'string' &&
    typeof candidate.variable_id === 'string' &&
    isValidVariableId(candidate.variable_id) &&
    Array.isArray(candidate.cells) &&
    candidate.cells.length > 0 &&
    candidate.cells.length <= MAX_CELLS_PER_REGION
  );
}
...
      startMonth: typeof parsed.startMonth === 'string' ? parsed.startMonth : '',
      endMonth: typeof parsed.endMonth === 'string' ? parsed.endMonth : '',
      regionA: isValidRegion(parsed.regionA, 'A') && parsed.regionA.variable_id === variableA ? parsed.regionA : null,
      regionB: isValidRegion(parsed.regionB, 'B') && parsed.regionB.variable_id === variableB ? parsed.regionB : null,
```

**Substituição 1 (`frontend/src/services/sessionState.ts`):**
```ts
import { getVariableMetadata, isValidVariableId } from '../contracts/catalog';
import type { GridCell, RegionSelection } from '../contracts/types';
import type { TrendMode } from '../bench/benchMeta';
import { MAX_CELLS_PER_REGION } from '../geo/gridGeometry';

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidYearMonth(value: unknown): value is string {
  return typeof value === 'string' && YEAR_MONTH_PATTERN.test(value);
}

function isValidGridCell(cell: unknown): cell is GridCell {
  if (!cell || typeof cell !== 'object') return false;
  const candidate = cell as Partial<GridCell>;
  const bounds = candidate.bounds_leaflet;
  return (
    typeof candidate.cell_id === 'string' &&
    candidate.cell_id.length > 0 &&
    typeof candidate.lat === 'number' &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lon === 'number' &&
    Number.isFinite(candidate.lon) &&
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    Array.isArray(bounds[0]) &&
    bounds[0].length === 2 &&
    Number.isFinite(bounds[0][0]) &&
    Number.isFinite(bounds[0][1]) &&
    Array.isArray(bounds[1]) &&
    bounds[1].length === 2 &&
    Number.isFinite(bounds[1][0]) &&
    Number.isFinite(bounds[1][1])
  );
}
```
E em `isValidRegion` + retorno de `loadPersistedSession`:
```ts
function isValidRegion(value: unknown, expectedSlot: 'A' | 'B'): value is RegionSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegionSelection>;
  if (
    candidate.slot !== expectedSlot ||
    typeof candidate.region_id !== 'string' ||
    typeof candidate.variable_id !== 'string' ||
    !isValidVariableId(candidate.variable_id) ||
    !Array.isArray(candidate.cells) ||
    candidate.cells.length === 0 ||
    candidate.cells.length > MAX_CELLS_PER_REGION
  ) {
    return false;
  }
  const expectedModel = getVariableMetadata(candidate.variable_id).source_model;
  return (
    candidate.source_model === expectedModel &&
    candidate.cells.every(cell => isValidGridCell(cell))
  );
}
```
```ts
      startMonth: isValidYearMonth(parsed.startMonth) ? parsed.startMonth : '',
      endMonth: isValidYearMonth(parsed.endMonth) ? parsed.endMonth : '',
```

**Substituição 2 (guarda complementar em `frontend/src/bench/ScientificBench.tsx:241-244`):**
```ts
  const isYearMonth = (val: string | undefined): val is string =>
    Boolean(val && /^\d{4}-(0[1-9]|1[0-2])$/.test(val));
  const firstDate = isYearMonth(firstMonth) ? `${firstMonth}-01` : undefined;
  const lastDate = isYearMonth(lastMonth)
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : undefined;
```

---

### `AUD-05` — Troca de Aba Desmonta `MapWorkspace` e Destrói o Estado `Mesmo Local (A=B)`

- **Severidade:** **Médio**
- **Arquivo e linhas:** `frontend/src/App.tsx`: linhas **259–296**
- **Bug e impacto:** `<MapWorkspace>` só existe na árvore quando `tab === 'map'`. Ao finalizar uma análise (`setTab('bench')` em `L142`) ou navegar entre abas, `<MapWorkspace>` desmonta, perdendo `sameLocation` (`A=B`), histórico de desfazer e zoom do mapa. Além disso, se o usuário trocar `Variável B` (ex.: `MERRA-2` → `CERES`) na sidebar enquanto está na aba `Bancada científica`, `handleVariableBChange` limpa `regionB`, e o espelhamento `A=B` nunca re-snapa `regionB` porque `MapWorkspace` está desmontado.
- **Solução com zero conflito de merge com a `PROD-1`:** manter `<MapWorkspace>` montado usando um wrapper com `display: tab === 'map' ? 'contents' : 'none'`. Como `bench.css:30` estiliza `.exploration > section`, `display: contents` preserva exatamente o layout CSS Grid quando visível; quando `tab === 'bench'`, `MapWorkspace` permanece montado preservando `sameLocation` e re-executando o `useEffect` de `mirrorRegionSelection`, enquanto o `ResizeObserver` já existente dispara `map.invalidateSize()` automaticamente ao voltar para `'map'`.

**Trecho atual (`frontend/src/App.tsx:259-296`):**
```tsx
          {tab === 'map' ? (
            <MapWorkspace
              variableA={variableA ? variableA as VariableId : null}
              variableB={variableB ? variableB as VariableId : null}
              periodReady={periodReady}
              startMonth={start}
              endMonth={end}
              regionA={regionA}
              regionB={regionB}
              onRegionAChange={setRegionA}
              onRegionBChange={setRegionB}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              onAnalyze={analyzeSelection}
              onCancel={cancelAnalysis}
            />
          ) : (
            <ScientificBench
              analysis={analysis}
              variableA={variableA}
              variableB={variableB}
              regionA={regionA}
              regionB={regionB}
              start={start}
              end={end}
              periodReady={periodReady}
              analyzedAt={analyzedAt}
              anomaly={anomaly}
              separate={separate}
              dual={dual}
              trendMode={trendMode}
              onAnomalyChange={setAnomaly}
              onSeparateChange={setSeparate}
              onDualChange={setDual}
              onTrendModeChange={setTrendMode}
              onBackToMap={() => setTab('map')}
            />
          )}
```

**Substituição:**
```tsx
          <div style={{ display: tab === 'map' ? 'contents' : 'none' }}>
            <MapWorkspace
              variableA={variableA ? variableA as VariableId : null}
              variableB={variableB ? variableB as VariableId : null}
              periodReady={periodReady}
              startMonth={start}
              endMonth={end}
              regionA={regionA}
              regionB={regionB}
              onRegionAChange={setRegionA}
              onRegionBChange={setRegionB}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              onAnalyze={analyzeSelection}
              onCancel={cancelAnalysis}
            />
          </div>
          {tab === 'bench' && (
            <ScientificBench
              analysis={analysis}
              variableA={variableA}
              variableB={variableB}
              regionA={regionA}
              regionB={regionB}
              start={start}
              end={end}
              periodReady={periodReady}
              analyzedAt={analyzedAt}
              anomaly={anomaly}
              separate={separate}
              dual={dual}
              trendMode={trendMode}
              onAnomalyChange={setAnomaly}
              onSeparateChange={setSeparate}
              onDualChange={setDual}
              onTrendModeChange={setTrendMode}
              onBackToMap={() => setTab('map')}
            />
          )}
```

---

### `AUD-10` — Validação Incompleta de Estatísticas no Contrato e Acessos sem Guarda na UI

- **Severidade:** **Médio**
- **Arquivos e linhas:**
  - `frontend/src/contracts/contractValidator.ts`: linhas **152–185**
  - `frontend/src/bench/ScientificBench.tsx`: linhas **101–103**, **111**, **131**, **143**, **805**, **826**, **841**, **846**, **850**, **858–865**
- **Bug e impacto:** `validateVariableStatistics` não rejeita `unit`/`trend_unit` contendo `%` quando `scale_type === 'interval'`, e não valida `intercept_at_start_A0`, `slope_ci95_low/high`, `cumulative_model_change`, `quadratic_acceleration_B2`, `regime_shape`, `confidence_tier`, `correlation_and_coupling.*` nem `outliers_mahalanobis`. Na `ScientificBench.tsx`, acessos diretos como `CONFIDENCE_LABELS[tier].label` ou `number.toFixed(...)` lançam `TypeError` se qualquer campo vier inesperado/não-finito.

**Trecho atual (`frontend/src/contracts/contractValidator.ts:152-185`):**
```ts
  // Trava do Invariante #3: proibido exibir variação percentual em escalas intervalares (°C, kPa).
  if (scaleType === 'interval' && data.allow_percentage_change) {
    throw new ContractValidationError(
      `Violação do Invariante #3 em ${prefix}: scale_type="interval" (${varId}) não pode ter allow_percentage_change=true.`,
    );
  }

  if (!isRecord(data.period)) {
    throw new ContractValidationError(`${prefix}.period ausente.`);
  }
  assertFiniteNumber(data.period.n_observations, `${prefix}.period.n_observations`);
  assertFiniteNumber(data.period.n_effective_ar1, `${prefix}.period.n_effective_ar1`);

  if (!isRecord(data.regression)) {
    throw new ContractValidationError(`${prefix}.regression ausente.`);
  }
  assertFiniteNumber(data.regression.slope_per_decade_ols, `${prefix}.regression.slope_per_decade_ols`);
  assertFiniteNumber(data.regression.slope_per_decade_sen, `${prefix}.regression.slope_per_decade_sen`);

  if (!isRecord(data.significance)) {
    throw new ContractValidationError(`${prefix}.significance ausente.`);
  }
  assertNumberInRange(data.significance.p_value_naive, 0, 1, `${prefix}.significance.p_value_naive`);
  assertNumberInRange(
    data.significance.p_value_ar1_corrected,
    0,
    1,
    `${prefix}.significance.p_value_ar1_corrected`,
  );
  assertNumberInRange(data.significance.fdr_q_value, 0, 1, `${prefix}.significance.fdr_q_value`);
  if (typeof data.significance.is_significant_fdr05 !== 'boolean') {
    throw new ContractValidationError(`${prefix}.significance.is_significant_fdr05 deve ser boolean.`);
  }
```

**Substituição 1 (`frontend/src/contracts/contractValidator.ts:152-185`):**
```ts
  const unit = assertNonEmptyString(data.unit, `${prefix}.unit`);
  const trendUnit = assertNonEmptyString(data.trend_unit, `${prefix}.trend_unit`);

  // Trava do Invariante #3: proibido exibir variação percentual ou unidade "%" em escalas intervalares (°C, kPa).
  if (scaleType === 'interval' && (data.allow_percentage_change || unit.includes('%') || trendUnit.includes('%'))) {
    throw new ContractValidationError(
      `Violação do Invariante #3 em ${prefix}: scale_type="interval" (${varId}) não pode usar variação ou unidade "%".`,
    );
  }

  if (!isRecord(data.period)) {
    throw new ContractValidationError(`${prefix}.period ausente.`);
  }
  assertFiniteNumber(data.period.n_observations, `${prefix}.period.n_observations`);
  assertFiniteNumber(data.period.n_effective_ar1, `${prefix}.period.n_effective_ar1`);

  if (!isRecord(data.regression)) {
    throw new ContractValidationError(`${prefix}.regression ausente.`);
  }
  assertFiniteNumber(data.regression.intercept_at_start_A0, `${prefix}.regression.intercept_at_start_A0`);
  assertFiniteNumber(data.regression.slope_per_decade_ols, `${prefix}.regression.slope_per_decade_ols`);
  assertFiniteNumber(data.regression.slope_per_decade_sen, `${prefix}.regression.slope_per_decade_sen`);
  assertFiniteNumber(data.regression.slope_ci95_low, `${prefix}.regression.slope_ci95_low`);
  assertFiniteNumber(data.regression.slope_ci95_high, `${prefix}.regression.slope_ci95_high`);
  assertFiniteNumber(data.regression.cumulative_model_change, `${prefix}.regression.cumulative_model_change`);
  assertFiniteNumber(data.regression.quadratic_acceleration_B2, `${prefix}.regression.quadratic_acceleration_B2`);
  const regime = assertNonEmptyString(data.regression.regime_shape, `${prefix}.regression.regime_shape`);
  if (!['linear', 'accelerating_rise', 'accelerating_decline', 'saturating', 'non_monotonic'].includes(regime)) {
    throw new ContractValidationError(`${prefix}.regression.regime_shape inválido: ${regime}`);
  }

  if (!isRecord(data.correlation_and_coupling)) {
    throw new ContractValidationError(`${prefix}.correlation_and_coupling ausente.`);
  }
  assertNumberInRange(data.correlation_and_coupling.pearson_r, -1, 1, `${prefix}.correlation_and_coupling.pearson_r`);
  assertNumberInRange(data.correlation_and_coupling.kendall_tau, -1, 1, `${prefix}.correlation_and_coupling.kendall_tau`);
  assertNumberInRange(data.correlation_and_coupling.r_squared, 0, 1, `${prefix}.correlation_and_coupling.r_squared`);
  assertFiniteNumber(data.correlation_and_coupling.ellipse_aspect_ratio, `${prefix}.correlation_and_coupling.ellipse_aspect_ratio`);

  if (!isRecord(data.significance)) {
    throw new ContractValidationError(`${prefix}.significance ausente.`);
  }
  assertNumberInRange(data.significance.p_value_naive, 0, 1, `${prefix}.significance.p_value_naive`);
  assertNumberInRange(
    data.significance.p_value_ar1_corrected,
    0,
    1,
    `${prefix}.significance.p_value_ar1_corrected`,
  );
  assertNumberInRange(data.significance.fdr_q_value, 0, 1, `${prefix}.significance.fdr_q_value`);
  if (typeof data.significance.is_significant_fdr05 !== 'boolean') {
    throw new ContractValidationError(`${prefix}.significance.is_significant_fdr05 deve ser boolean.`);
  }
  const tier = assertNonEmptyString(data.significance.confidence_tier, `${prefix}.significance.confidence_tier`);
  if (!['CONFIRMED_HIGH', 'CONFIRMED_MODERATE', 'INSUFFICIENT_SIGNAL', 'NO_TREND'].includes(tier)) {
    throw new ContractValidationError(`${prefix}.significance.confidence_tier inválido: ${tier}`);
  }

  if (!Array.isArray(data.outliers_mahalanobis)) {
    throw new ContractValidationError(`${prefix}.outliers_mahalanobis deve ser um array.`);
  }
  data.outliers_mahalanobis.forEach((outlier, index) => {
    if (!isRecord(outlier)) {
      throw new ContractValidationError(`${prefix}.outliers_mahalanobis[${index}] deve ser objeto.`);
    }
    assertNonEmptyString(outlier.date, `${prefix}.outliers_mahalanobis[${index}].date`);
    assertFiniteNumber(outlier.mahalanobis_d, `${prefix}.outliers_mahalanobis[${index}].mahalanobis_d`);
  });
```

**Substituição 2 (fallbacks na UI — `frontend/src/bench/ScientificBench.tsx`):**
- Criar um helper `formatFixed(val: number | null | undefined, digits: number): string` em `ScientificBench.tsx` (ou reutilizar `formatPointValue` parametrizado com `digits = 3`) para evitar `.toFixed(...)` direto nas linhas `143, 826, 850, 858, 859, 865`.
- Usar fallback em `CONFIDENCE_LABELS[tier] ?? CONFIDENCE_LABELS.INSUFFICIENT_SIGNAL` (`L101, L841`) e `REGIME_LABELS[regime] ?? regime` (`L102, L805`).

---

### `AUD-11` — Overflow Horizontal de `region_a_id` / `region_b_id` no Card 4 de Diagnósticos

- **Severidade:** **Médio**
- **Arquivos e linhas:**
  - `frontend/src/bench.css`: linhas **220** e **225**
  - Elemento afetado em `frontend/src/bench/ScientificBench.tsx`: linhas **885–888** (`<code>{analysis.comparison_pair.region_a_id}</code>`)
- **Bug e impacto:** Com seleções de até 9–25 células, `region_a_id` e `region_b_id` formam strings contínuas sem espaços (100–250+ caracteres). Como `.diag-card` (`L220`) e `.diag-meta code` (`L225`) não têm `min-width: 0` nem quebra de palavra, o `<code>` estoura horizontalmente a grade em `375px` e comprime colunas em `1366×768`.

**Trecho atual (`frontend/src/bench.css:220-226`):**
```css
.diag-card { background: #122136; border: 1px solid #2a3f5c; border-radius: 10px; padding: .75rem .85rem; display: flex; flex-direction: column; gap: .55rem; }
.diag-card h4 { margin: 0; font-size: .9rem; color: #67e8f9; border-bottom: 1px solid #23364f; padding-bottom: .35rem; }
.diag-row { display: flex; flex-direction: column; gap: .25rem; font-size: .84rem; padding-top: .25rem; }
.diag-row + .diag-row { border-top: 1px dashed #243852; padding-top: .5rem; }
.diag-meta { color: #bdd0e6; font-size: .8rem; line-height: 1.45; }
.diag-meta code { color: #a5f3fc; background: #0a1422; padding: .08rem .28rem; border-radius: 4px; font-size: .78rem; }
```

**Substituição:**
```css
.diag-card { min-width: 0; background: #122136; border: 1px solid #2a3f5c; border-radius: 10px; padding: .75rem .85rem; display: flex; flex-direction: column; gap: .55rem; }
.diag-card h4 { margin: 0; font-size: .9rem; color: #67e8f9; border-bottom: 1px solid #23364f; padding-bottom: .35rem; }
.diag-row { display: flex; flex-direction: column; gap: .25rem; font-size: .84rem; padding-top: .25rem; }
.diag-row + .diag-row { border-top: 1px dashed #243852; padding-top: .5rem; }
.diag-meta { min-width: 0; color: #bdd0e6; font-size: .8rem; line-height: 1.45; }
.diag-meta code { color: #a5f3fc; background: #0a1422; padding: .08rem .28rem; border-radius: 4px; font-size: .78rem; overflow-wrap: anywhere; word-break: break-word; }
```

---

### `AUD-12` — Colisões de Layout Mobile (`375px`) em `.map-status`, `.map-legend` e Controle de Camadas

- **Severidade:** **Médio**
- **Arquivo e linhas:** `frontend/src/bench.css`: linhas **73–75** e **192–196**
- **Bug e impacto:**
  1. `.map-status` (`L75`) não possui `flex-wrap: wrap` (apenas `.map-toolbar` tem em `L74`). Em `375px`, `.map-message` (`notice + gridNotice + offlineTileNotice`) disputa espaço horizontal com `.map-tools`, ficando espremida em uma coluna minúscula.
  2. Em `.map-stage` (`min-height: 300px`, `L127`), no `375px`, `.map-legend` (`left: .75rem; bottom: .75rem; max-width: 13.5rem`) colide horizontalmente com `.leaflet-control-attribution` (bottom-right), e `.leaflet-control-layers` expandido (`topright`) sobrepõe `.box-select-badge` / `.map-legend` verticalmente.

**Trecho atual (`frontend/src/bench.css:73-75`):**
```css
.map-toolbar, .map-status { z-index: 500; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .55rem .75rem; background: #121e30; }
.map-toolbar { border-bottom: 1px solid #2a3c54; flex-wrap: wrap; }
.map-status { min-height: 1.8rem; color: #acc1d9; border-top: 1px solid #2a3c54; font-size: .85rem; }
```

**Substituição 1 (`frontend/src/bench.css:73-75`):**
```css
.map-toolbar, .map-status { z-index: 500; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .55rem .75rem; background: #121e30; }
.map-toolbar { border-bottom: 1px solid #2a3c54; flex-wrap: wrap; }
.map-status { min-height: 1.8rem; flex-wrap: wrap; color: #acc1d9; border-top: 1px solid #2a3c54; font-size: .85rem; }
```

**Trecho atual (`frontend/src/bench.css:192-196`):**
```css
@media (max-width: 700px) {
  .map-actions { position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; padding: .6rem .75rem; background: rgba(10, 20, 34, .96); border-top: 1px solid #2a3c54; backdrop-filter: blur(8px); }
  .map-actions > button { flex: 1; min-height: 2.5rem; }
  .map-legend { max-width: 13.5rem; font-size: .7rem; }
}
```

**Substituição 2 (`frontend/src/bench.css:192-196`):**
```css
@media (max-width: 700px) {
  .map-actions { position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; padding: .6rem .75rem; background: rgba(10, 20, 34, .96); border-top: 1px solid #2a3c54; backdrop-filter: blur(8px); }
  .map-actions > button { flex: 1; min-height: 2.5rem; }
  .map-message { flex-basis: 100%; }
  .map-legend { left: .5rem; bottom: 1.65rem; max-width: min(12.5rem, calc(100% - 1rem)); padding: .4rem .55rem; font-size: .68rem; }
  .map-container .leaflet-control-layers-expanded { max-height: 11rem; overflow-y: auto; }
}
```

---

### `AUD-13` — Formatação `-0.000` / `-0.00`, Falta de Guarda `Number.isFinite` e Unidades Ausentes

- **Severidade:** **Médio**
- **Arquivos e linhas:**
  - `frontend/src/bench/benchMeta.ts`: linhas **73–81**
  - `frontend/src/bench/ScientificBench.tsx`: linhas **518**, **522**, **825–827**, **896–898**
- **Bug e impacto:** `formatSignedNumber(-0.0002, 3)` produz `"-0.000"` (`"-0.00000"` para `B₂` com `decimals=5`), e `L518, 522` chamam `.toFixed(2)` direto (ex.: `"-0.00"`), sem checar `Number.isFinite`. Além disso, nos cards de diagnóstico, `OLS` (`L825`), `A₀` (`L826`) e `Δ Declive (A − B)` (`L897`) não exibem `{region.trend_unit}` / `{region.unit}`.

**Trecho atual (`frontend/src/bench/benchMeta.ts:73-81`):**
```ts
export function formatSignedNumber(value: number, decimals = 3): string {
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatPValue(value: number): string {
  if (value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}
```

**Substituição 1 (`frontend/src/bench/benchMeta.ts:73-81`):**
```ts
export function formatSignedNumber(value: number, decimals = 3): string {
  if (!Number.isFinite(value)) return '—';
  const threshold = 0.5 * 10 ** -decimals;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  const formatted = normalized.toFixed(decimals);
  return normalized > 0 ? `+${formatted}` : formatted;
}

export function formatPValue(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value > 0 && value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}
```

**Trecho atual (`frontend/src/bench/ScientificBench.tsx:518,522,825-828,896-898`):**
```tsx
                <strong>{analysis.comparison_pair.multiscale_correlation.long_term_secular_r.toFixed(2)}</strong>
...
                <strong>{analysis.comparison_pair.multiscale_correlation.short_term_detrended_r.toFixed(2)}</strong>
```
```tsx
                  <div className="diag-meta">
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)}</b> · A₀:{' '}
                    <code>{region.regression.intercept_at_start_A0.toFixed(3)}</code> · Δ Modelo:{' '}
                    <b>{formatSignedNumber(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                  </div>
```
```tsx
                        {' '}· Δ Declive (A − B) ={' '}
                        <b>{formatSignedNumber(analysis.comparison_pair.slope_difference_per_decade, 4)}</b>
```

**Substituição 2 (`frontend/src/bench/ScientificBench.tsx`):**
- Nas linhas `518` e `522`, usar `formatSignedNumber(..., 2)`.
- Nas linhas `825–827`:
```tsx
                  <div className="diag-meta">
                    OLS: <b>{formatSignedNumber(region.regression.slope_per_decade_ols, 4)} {region.trend_unit}</b> · A₀:{' '}
                    <code>{formatPointValue(region.regression.intercept_at_start_A0)} {region.unit}</code> · Δ Modelo:{' '}
                    <b>{formatSignedNumber(region.regression.cumulative_model_change, 4)} {region.unit}</b>
                  </div>
```
- Nas linhas `896–898`:
```tsx
                        {' '}· Δ Declive (A − B) ={' '}
                        <b>
                          {formatSignedNumber(analysis.comparison_pair.slope_difference_per_decade, 4)}{' '}
                          {regions[0]?.trend_unit ?? ''}
                        </b>
```

---

### `AUD-14` — Consistência de `CLOUD_AMT` (`unit: '%'` com `allow_percentage_change: false`)

- **Severidade:** **Polimento**
- **Arquivo e linhas:** `frontend/src/contracts/catalog.ts`: linhas **302–307** (espelho no backend em `data/services/comparison_service.py:48-54` na branch `data`)
- **Bug e impacto:** Embora `CLDTOT` (`L290-301`) e `RH2M` (`unit: '%'`, `trend_unit: 'p.p./década'`) tenham `allow_percentage_change: false` por serem razões já expressas em porcentagem, `CLOUD_AMT` (`is_alias_of: 'CLDTOT'`) está marcado com `allow_percentage_change: true`.

**Trecho atual (`frontend/src/contracts/catalog.ts:302-307`):**
```ts
  CLOUD_AMT: {
    variable_id: 'CLOUD_AMT', variable_name: 'Cobertura de Nuvens', domain: 'Radiação e Nuvens',
    source_model: 'CERES_SYN1deg', resolution: CERES_RESOLUTION, grid_origin: CERES_ORIGIN, min_year: 1984,
    scale_type: 'ratio', unit: '%', trend_unit: 'p.p./década', allow_percentage_change: true, land_only_mask: false,
    is_alias_of: 'CLDTOT',
  },
```

**Substituição:** alterar `allow_percentage_change: true` para `allow_percentage_change: false` (e alinhar posteriormente o mesmo campo em `data/services/comparison_service.py` na branch `data`).

---

### `AUD-15` — Margens Horizontais Fixas do Plotly em Telas Estreitas (`375px`)

- **Severidade:** **Polimento**
- **Arquivo e linhas:** `frontend/src/bench/ScientificBench.tsx`: linhas **746** e **783**
- **Bug e impacto:** Os dois gráficos usam `margin: { l: 75, t: 28, r: 75, b: 95 }` (`L746`) e `{ l: 75, t: 42, r: 28, b: 85 }` (`L783`), consumindo `150px` horizontais fixos mesmo dentro de `.chart-box` estreito (~`320px` no mobile `375px`), comprimindo a plotagem embora os eixos já tenham `automargin: true`.

**Trecho atual (`frontend/src/bench/ScientificBench.tsx:746` e `783`):**
```tsx
                  margin: { l: 75, t: 28, r: 75, b: 95 },
```
```tsx
                  margin: { l: 75, t: 42, r: 28, b: 85 },
```

**Substituição:** reduzir margens fixas horizontais para que `automargin: true` controle o respiro dos rótulos sem estrangular o gráfico em `375px`:
```tsx
                  margin: { l: 48, t: 28, r: 44, b: 85 },
```
```tsx
                  margin: { l: 48, t: 42, r: 20, b: 78 },
```

---

## 3. Prompt Pronto para Copiar e Colar (`PROD-2` — Branch `frontend`)

```text
Atue na branch `frontend` aplicando em lote as correções cirúrgicas dos 10 itens documentados em `PROD2_QA_HANDOFF.md` (`AUD-01`, `AUD-02`, `AUD-03`, `AUD-05`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`), SEM alterar `MapWorkspace.tsx` nem `gridGeometry.ts` (exclusivos da `PROD-1`):

1. `frontend/src/App.tsx`:
   - (`AUD-01`) Elevar `zIndex` de `comboboxProps` e dos dois `popoverProps` de `1100` para `1300` para ficarem acima de `.workspace > aside` (`1200`) e `.drawer-backdrop` (`1150`) no mobile.
   - (`AUD-02`) Chamar `analysisControllerRef.current?.abort(...)` no `useEffect` de invalidação (`[variableA, variableB, start, end, regionA, regionB]`) e checar `if (controller.signal.aborted) return;` logo após `await getRegionData(...)` antes de `setAnalysis`/`setAnalyzedAt`/`setTab`.
   - (`AUD-05`) Manter `<MapWorkspace>` montado quando `tab === 'bench'` envolvendo-o em `<div style={{ display: tab === 'map' ? 'contents' : 'none' }}>` para preservar `sameLocation` (`A=B`) e o re-snap ao alternar abas ou variáveis sem conflitar com `MapWorkspace.tsx`.

2. `frontend/src/services/sessionState.ts` + `frontend/src/bench/ScientificBench.tsx`:
   - (`AUD-03`) Validar `GridCell` completo e `source_model` compatível com o catálogo em `isValidRegion`, validar `startMonth`/`endMonth` com `/^\d{4}-(0[1-9]|1[0-2])$/` no `loadPersistedSession`, e proteger `firstDate`/`lastDate` em `ScientificBench.tsx` contra strings de mês inválidas.

3. `frontend/src/contracts/contractValidator.ts` + `frontend/src/contracts/catalog.ts`:
   - (`AUD-10`) Validar `unit`, `trend_unit` (proibindo `%` em variáveis `interval`), todos os campos finitos de `regression` (`intercept_at_start_A0`, `slope_ci95_*`, `cumulative_model_change`, `quadratic_acceleration_B2`, `regime_shape`), `correlation_and_coupling.*`, `significance.confidence_tier` e `outliers_mahalanobis`.
   - (`AUD-14`) Alterar `CLOUD_AMT.allow_percentage_change` para `false` em `catalog.ts` (sinalizar espelho equivalente em `data/services/comparison_service.py` na branch `data`).

4. `frontend/src/bench/benchMeta.ts` + `frontend/src/bench/ScientificBench.tsx` + `frontend/src/bench.css`:
   - (`AUD-10` UI) Adicionar fallbacks seguros para `CONFIDENCE_LABELS`, `REGIME_LABELS` e `.toFixed(...)` na bancada.
   - (`AUD-11`) Adicionar `min-width: 0` em `.diag-card`/`.diag-meta` e `overflow-wrap: anywhere; word-break: break-word;` em `.diag-meta code`.
   - (`AUD-12`) Adicionar `flex-wrap: wrap` em `.map-status`, ajustar `.map-message`, `.map-legend` e `.leaflet-control-layers-expanded` em `@media (max-width: 700px)`.
   - (`AUD-13`) Normalizar `-0` (`Math.abs(v) < 0.5 * 10 ** -decimals`) e `!Number.isFinite` em `formatSignedNumber`/`formatPValue`, usar `formatSignedNumber` em `r_global`/`r_detrended`, e exibir unidades em `OLS`, `A₀` e `Δ Declive (A − B)`.
   - (`AUD-15`) Reduzir margens horizontais fixas dos dois `<Plot>` (`l: 48, r: 44` / `l: 48, r: 20`) mantendo `automargin: true`.

5. Crie/atualize testes unitários cobrindo `sessionState.ts` corrompido (`AUD-03`), `contractValidator.ts` (`AUD-10`), `formatSignedNumber` (`AUD-13`) e `ScientificBench.tsx` mobile/fallbacks. Rode `npx tsc --noEmit`, `npx vitest run`, `npm run verify:offline` e `npm run build` em `frontend/` antes de commitar.
```
