import type { LucideIcon } from 'lucide-react';

export function ListColumn({ icon: Icon, label, detail }: { icon: LucideIcon; label: string; detail: string }) {
  return <span className="list-column"><Icon size={15} strokeWidth={1.6} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span></span>;
}
