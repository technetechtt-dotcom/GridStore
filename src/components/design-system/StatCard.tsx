import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from '../ui/card';

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  trend = 'neutral',
  className,
}: {
  label: string;
  value: string;
  change?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}) {
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp;

  return (
    <Card className={cn('border-border/60 shadow-soft overflow-hidden', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</p>
            {change ? (
              <p
                className={cn(
                  'mt-2 inline-flex items-center gap-1 text-xs font-medium',
                  trend === 'up' && 'text-success',
                  trend === 'down' && 'text-destructive',
                  trend === 'neutral' && 'text-muted-foreground'
                )}
              >
                {trend !== 'neutral' ? <TrendIcon className="h-3.5 w-3.5" /> : null}
                {change}
              </p>
            ) : null}
          </div>
          {Icon ? (
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
