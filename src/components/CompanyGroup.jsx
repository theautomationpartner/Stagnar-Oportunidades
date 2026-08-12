import { useState } from 'react'
import { MdExpandMore } from 'react-icons/md'
import QuoteCard from './QuoteCard'
import './CompanyGroup.css'

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
  onToggleOpcional,
  rcOptions,
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="company-group">
      <button className="company-group__head" type="button" onClick={() => setOpen((v) => !v)}>
        <span className="company-group__name">{compania}</span>
        <span className="company-group__count">{entries.length} opciones disponibles</span>
        <MdExpandMore
          className={open ? 'company-group__chevron company-group__chevron--open' : 'company-group__chevron'}
        />
      </button>

      {open && (
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
              onToggleOpcional={(field, checked) => onToggleOpcional(raw.id, field, checked)}
              rcOptions={rcOptions}
            />
          ))}
        </div>
      )}
    </div>
  )
}
