'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export interface InteractiveSelectProps<T> {
  id?: string
  value: string
  onChange: (value: string) => void
  onSelect?: (item: T) => void
  fetchSuggestions: (query: string, signal: AbortSignal) => Promise<T[]>
  getItemKey: (item: T, index: number) => string
  getItemLabel: (item: T) => string
  renderItem?: (item: T, isHighlighted: boolean) => React.ReactNode
  minQueryLength?: number
  debounceMs?: number
  placeholder?: string
  disabled?: boolean
  emptyText?: string
  className?: string
}

export function InteractiveSelect<T>({
  id,
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  getItemKey,
  getItemLabel,
  renderItem,
  minQueryLength = 3,
  debounceMs = 250,
  placeholder,
  disabled = false,
  emptyText = 'Aucun résultat',
  className,
}: InteractiveSelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [items, setItems] = React.useState<T[]>([])
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const skipNextFetchRef = React.useRef(false)
  const fetchRef = React.useRef(fetchSuggestions)
  fetchRef.current = fetchSuggestions

  // Close dropdown when disabled
  React.useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])

  // Close on outside click
  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  // Debounced async suggestion fetch
  React.useEffect(() => {
    if (disabled) return

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false
      return
    }

    const trimmed = value.trim()
    if (trimmed.length < minQueryLength) {
      setItems([])
      setIsLoading(false)
      setOpen(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const results = await fetchRef.current(trimmed, controller.signal)
        if (!controller.signal.aborted) {
          setItems(results)
          setHighlightedIndex(results.length > 0 ? 0 : -1)
          setOpen(true)
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !controller.signal.aborted) {
          setItems([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value, disabled, minQueryLength, debounceMs])

  const handleSelectItem = (item: T) => {
    skipNextFetchRef.current = true
    onChange(getItemLabel(item))
    onSelect?.(item)
    setOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) {
      if (e.key === 'ArrowDown' && items.length > 0) {
        setOpen(true)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      handleSelectItem(items[highlightedIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (!disabled && items.length > 0) {
              setOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          className={cn(isLoading && 'pr-8')}
        />
        {isLoading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {emptyText}
            </li>
          ) : (
            items.map((item, index) => {
              const isHighlighted = index === highlightedIndex
              return (
                <li
                  key={getItemKey(item, index)}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(e) => {
                    // Prevent input blur before selection fires
                    e.preventDefault()
                    handleSelectItem(item)
                  }}
                  className={cn(
                    'cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors',
                    isHighlighted
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60',
                  )}
                >
                  {renderItem
                    ? renderItem(item, isHighlighted)
                    : getItemLabel(item)}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
