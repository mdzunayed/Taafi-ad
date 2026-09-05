import { BrandLogo } from '@/components/layout/brand-logo';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      {/* Sign-in hero: the lockup already reads "Taafi", so the only text it
          needs is the qualifier that this is the staff console. */}
      <div className="flex flex-col items-center gap-2 self-center">
        <BrandLogo priority className="h-10" />
        <span className="text-muted-foreground text-sm font-medium">
          Operations console
        </span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-muted-foreground text-center text-xs">
        Staff access only. Patients and clinicians use the Taafi mobile app.
      </p>
    </div>
  );
}
