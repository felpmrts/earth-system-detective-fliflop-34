// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CopilotRichText } from '../bench/CopilotRichText';

afterEach(() => {
  cleanup();
});

describe('CopilotRichText Markdown & LaTeX safe renderer', () => {
  it('preserves single line breaks, renders horizontal dividers, headings, and lists cleanly', () => {
    const sample = [
      '## Resumo Estatístico',
      '**Evidência Principal:**',
      'Linha 1 com quebra simples',
      'Linha 2 separada visualmente',
      '---',
      '  - *Itálico* e **Negrito ($B_2$)** no item',
      '1. Passo um',
    ].join('\n');

    const { container } = render(<CopilotRichText text={sample} />);
    expect(container.querySelector('.cp-heading')?.textContent).toContain('Resumo Estatístico');
    expect(container.querySelectorAll('hr.cp-divider').length).toBe(1);
    expect(container.querySelectorAll('br').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('em')?.textContent).toBe('Itálico');
    expect(container.querySelector('ul.cp-list li strong')?.textContent).toContain('Negrito');
    expect(container.querySelectorAll('ul.cp-list li').length).toBe(1);
    expect(container.querySelectorAll('ol.cp-list li').length).toBe(1);
  });

  it('renders inline and display LaTeX formulas cleanly without leaving raw TeX backslashes', () => {
    const sample = [
      'Tendência: $B_{\\text{Sen}} = \\frac{\\Delta y}{\\Delta t} \\approx +0.45 \\pm 0.05$ e \\(p \\leq 0.05 \\implies \\text{sig}\\).',
      '',
      '$$',
      '\\sigma_{\\text{eff}} = \\sqrt{\\bar{x}^2 + \\hat{y}^2} \\quad (\\Delta T \\neq 0)',
      '$$',
    ].join('\n');

    const { container } = render(<CopilotRichText text={sample} />);
    const fullText = container.textContent ?? '';
    expect(fullText).not.toContain('\\frac');
    expect(fullText).not.toContain('\\Delta');
    expect(fullText).not.toContain('\\approx');
    expect(fullText).not.toContain('\\implies');
    expect(fullText).not.toContain('\\leq');
    expect(fullText).not.toContain('\\bar');
    expect(fullText).not.toContain('\\quad');
    expect(fullText).not.toContain('\\neq');

    expect(container.querySelectorAll('.cp-math-inline').length).toBe(2);
    expect(container.querySelectorAll('.cp-math-block').length).toBe(1);
    expect(container.querySelectorAll('.cp-math-frac').length).toBe(1);
    expect(container.querySelectorAll('.cp-math-sqrt').length).toBe(1);
  });

  it('renders Markdown tables, blockquotes, and guards currency pairs from LaTeX parsing', () => {
    const sample = [
      '> Nota metodológica: custo de $50 a $60 não é fórmula.',
      '',
      '| Métrica | Região A | Região B |',
      '| :--- | :--- | :--- |',
      '| Theil-Sen | $+0.31$ | $-0.12$ |',
    ].join('\n');

    const { container } = render(<CopilotRichText text={sample} />);
    expect(container.querySelector('blockquote.cp-quote')?.textContent).toContain('$50 a $60');
    expect(container.querySelectorAll('.cp-math-inline').length).toBe(2);
    expect(container.querySelectorAll('table.cp-table th').length).toBe(3);
    expect(container.querySelectorAll('table.cp-table tbody tr').length).toBe(1);
  });

  it('expands escaped literal \\n newlines cleanly without corrupting TeX \\nabla commands', () => {
    const sample = 'Linha 1\\n---\\nEquação: $\\nabla \\cdot F = 0$';
    const { container } = render(<CopilotRichText text={sample} />);
    expect(container.querySelectorAll('hr.cp-divider').length).toBe(1);
    expect(container.textContent ?? '').toContain('∇');
  });
});
