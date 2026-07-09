type IconProps = { size: number };

function CashIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4" width="13" height="8" rx="1.2" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

function CheckIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1" />
      <path d="M3.5 10.5c1-1.2 2-1.2 3 0s2 1.2 3 0 2-1.2 3 0" />
    </svg>
  );
}

function CreditCardIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.2" />
      <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" />
    </svg>
  );
}

function BankTransferIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6h10M9 3l3 3-3 3" />
      <path d="M14 10H4M7 13L4 10l3-3" />
    </svg>
  );
}

function RecurringIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8a5 5 0 1 1-1.5-3.5" />
      <path d="M13 2v3h-3" />
    </svg>
  );
}

function BitIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.3" />
      <line x1="7" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const ICONS_BY_METHOD: Record<string, (props: IconProps) => React.ReactElement> = {
  "מזומן": CashIcon,
  "צ'ק": CheckIcon,
  "כרטיס אשראי": CreditCardIcon,
  "העברה בנקאית": BankTransferIcon,
  "הוראת קבע": RecurringIcon,
  "ביט": BitIcon,
};

export default function PaymentMethodIcon({ method, size = 14 }: { method: string; size?: number }) {
  const Icon = ICONS_BY_METHOD[method];
  return Icon ? <Icon size={size} /> : null;
}
