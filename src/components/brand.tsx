export default function Brand({ negative = false }: { negative?: boolean }) {
  return <div className="brand"><img className="brand-logo" src={negative ? '/Negative.svg' : '/Postive.svg'} alt="VATSIM Scandinavia" width={922} height={427} /></div>;
}
