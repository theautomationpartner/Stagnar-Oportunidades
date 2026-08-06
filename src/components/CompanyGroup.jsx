import { Accordion, AccordionItem } from '@vibe/core'
import QuoteCard from './QuoteCard'
import './CompanyGroup.css'

// Migrado a @vibe/core: Accordion/AccordionItem reemplaza el <button>+chevron
// custom — el ícono de expandir/colapsar y el manejo de abierto/cerrado ahora
// son nativos (defaultIndex en vez de nuestro propio useState).
export default function CompanyGroup({
  compania,
  entries,
  selectedIds,
  onToggleSelected,
  defaultOpen,
  overridesByQuoteId,
  onApplyOverrides,
  onResetOverrides,
  onApplyToCompany,
  onClearCompany,
  onToggleOpcional,
  rcOptions,
}) {
  return (
    <Accordion className="company-group" defaultIndex={defaultOpen ? [0] : []}>
      <AccordionItem
        title={
          <span className="company-group__head">
            <span className="company-group__name">{compania}</span>
            <span className="company-group__count">{entries.length} opciones disponibles</span>
          </span>
        }
      >
        <div className="company-group__body">
          {entries.map(({ raw, quote }) => (
            <QuoteCard
              key={raw.id}
              raw={raw}
              quote={quote}
              selected={selectedIds.has(raw.id)}
              onToggleSelected={() => onToggleSelected(raw.id)}
              overrides={overridesByQuoteId[raw.id] ?? {}}
              onApplyOverrides={(values) => onApplyOverrides(raw.id, values)}
              onResetOverrides={() => onResetOverrides(raw.id)}
              onApplyToCompany={(values) => onApplyToCompany(compania, values)}
              onClearCompany={() => onClearCompany(compania)}
              onToggleOpcional={(field, checked) => onToggleOpcional(raw.id, field, checked)}
              rcOptions={rcOptions}
            />
          ))}
        </div>
      </AccordionItem>
    </Accordion>
  )
}
