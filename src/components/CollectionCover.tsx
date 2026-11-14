import { Atom, BookOpen, GraduationCap, Languages, School } from 'lucide-react';

export function CollectionCover({ title, category, label }: { title: string; category: string; label: string }) {
  const science = /ingénierie|énergie|physique/i.test(title);
  const language = category === 'Langues';
  const Icon = science ? Atom : language ? Languages : /maturité|lycée/i.test(title) ? GraduationCap : School;
  return <div className={`collection-cover collection-cover--${science ? 'science' : language ? 'languages' : category === 'France' ? 'france' : 'swiss'}`} aria-hidden="true">
    <span className="collection-cover-label">{label}</span>
    <div className="collection-cover-art"><span className="collection-cover-orbit" /><BookOpen className="collection-cover-book" /><Icon className="collection-cover-symbol" /></div>
    <span className="collection-cover-category">{category === 'Autres' ? 'Dowze Academie' : category}</span>
  </div>;
}
