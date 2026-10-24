interface SchoolFacadeProps {
  className?: string;
  priority?: boolean;
}

export function SchoolFacade({
  className,
  priority = false,
}: SchoolFacadeProps) {
  return (
    <figure className={className}>
      {/* The source PNG has 714 transparent rows above the building. */}
      <div className="relative aspect-[2743/1572] overflow-hidden">
        <img
          src="/assets/school-facade.png"
          alt="Façade of Sto. Domingo National Trade School"
          width={2743}
          height={2286}
          fetchPriority={priority ? "high" : undefined}
          className="absolute bottom-0 left-0 h-auto w-full max-w-none"
        />
      </div>
      <figcaption className="rounded-b-2xl bg-brand-strong px-5 py-4 text-xs font-medium leading-5 tracking-wide text-white sm:px-7">
        Baloc, Sto. Domingo, Nueva Ecija · Our school, your community
      </figcaption>
    </figure>
  );
}
