const INDUSTRIES = [
  {
    title: "Real estate",
    caption: "Site visits booked before the listing goes cold.",
    image:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=70",
  },
  {
    title: "Education",
    caption: "Counsellors walk into warm admissions calls.",
    image:
      "https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=900&q=70",
  },
  {
    title: "Healthcare",
    caption: "Every enquiry becomes a confirmed appointment.",
    image:
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=70",
  },
  {
    title: "Finance",
    caption: "Speed-to-lead for insurance, lending, and wealth.",
    image:
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=70",
  },
];

export function IndustryGallery() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {INDUSTRIES.map((item) => (
        <article key={item.title} className="group overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-white">
          <div className="relative h-40 overflow-hidden">
            <img
              src={item.image}
              alt={item.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          </div>
          <div className="p-4">
            <h3 className="font-extrabold">{item.title}</h3>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">{item.caption}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
