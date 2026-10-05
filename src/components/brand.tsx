export default function Brand({ negative }: { negative?: boolean }) {
  if (negative !== undefined) return <div className="brand"><img className="brand-logo" src={negative ? '/Negative.svg' : '/Postive.svg'} alt="VATSIM Scandinavia" width={922} height={427} /></div>;
  return <div className="brand"><img className="brand-logo brand-logo-light" src="/Postive.svg" alt="VATSIM Scandinavia" width={922} height={427} /><img className="brand-logo brand-logo-dark" src="/Negative.svg" alt="VATSIM Scandinavia" width={922} height={427} /></div>;
}
