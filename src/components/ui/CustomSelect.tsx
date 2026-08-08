import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  label: React.ReactNode;
  value: string;
  icon?: React.ReactNode;
  colorClass?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
}

type MenuPlacement = 'above' | 'below';

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: MenuPlacement;
}

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 8;
const MAX_MENU_HEIGHT = 320;

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  triggerClassName = '',
  menuClassName = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const triggerElement = triggerRef.current;
      if (!triggerElement) return;

      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - VIEWPORT_MARGIN;
      const placeBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const availableSpace = Math.max(0, placeBelow ? spaceBelow : spaceAbove);
      const maxHeight = Math.min(MAX_MENU_HEIGHT, availableSpace);
      const width = rect.width;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
      );
      const top = placeBelow
        ? Math.min(
            window.innerHeight - VIEWPORT_MARGIN - maxHeight,
            rect.bottom + MENU_GAP,
          )
        : Math.max(VIEWPORT_MARGIN, rect.top - MENU_GAP - maxHeight);

      setMenuPosition({
        top,
        left,
        width,
        maxHeight,
        placement: placeBelow ? 'below' : 'above',
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed ${triggerClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedOption?.icon && (
            <span className="shrink-0">{selectedOption.icon}</span>
          )}
          <span className={`truncate ${selectedOption?.colorClass || 'text-zinc-700'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        menuPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed z-[9999] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg ${menuClassName}`}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: menuPosition.maxHeight,
              transformOrigin:
                menuPosition.placement === 'below' ? 'top left' : 'bottom left',
            }}
          >
            <div className="max-h-full overflow-y-auto p-1 scroll-smooth">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-colors
                      ${
                        isSelected
                          ? 'bg-zinc-900 text-white'
                          : 'hover:bg-zinc-50 text-zinc-700'
                      }
                    `}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {option.icon && <span className="shrink-0">{option.icon}</span>}
                      <span className={isSelected ? 'text-white' : (option.colorClass || '')}>
                        {option.label}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
