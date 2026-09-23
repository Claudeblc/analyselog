// Aide : les gestes essentiels de Belcram Family, expliqués simplement.
import { h } from '../core.js';

const FAQ = [
  ['📺 Connecter la télévision', 'Sur la TV, ouvrez l’adresse de Belcram Family en ajoutant « ?tv=1 » (ou « ?tv=vertical » pour une TV verticale). Un QR code s’affiche : scannez-le avec votre téléphone et touchez « Autoriser ».'],
  ['🎮 Le téléphone comme télécommande', 'Touchez 🎮 en haut de l’écran : flèches, OK, retour, lecture/pause. Sur une photo, une vidéo ou un Apéro Time, « 📺 Afficher sur la TV » l’envoie directement.'],
  ['📱 Le téléphone comme caméra de la TV', 'Lancez l’appel sur la TV : elle affiche un QR code. Scannez-le, autorisez caméra et micro, puis posez le téléphone face à la famille.'],
  ['🍷 Annoter un Apéro Time', 'Ouvrez un Apéro Time, sélectionnez un passage (surligner, souligner, remarque) ou prenez le crayon ✏️ pour dessiner, entourer, faire une flèche. Tout apparaît aussitôt sur les autres écrans, dans votre couleur.'],
  ['✍️ Écrire un Apéro Time (Papa)', 'Apéro Time → « Écrire ». Le brouillon s’enregistre tout seul. Les onglets Smartphone / Tablette / TV / WhatsApp montrent le rendu avant d’envoyer. Publiez tout de suite ou programmez.'],
  ['🤝 Qui peut m’aider ?', 'Notre Famille : chacun a ses pastilles de compétences (santé, informatique, emploi, RH…). Écrivez votre besoin, Belcram Family vous dit vers qui vous tourner.'],
  ['📢 Interphone', 'Choisissez la TV (ou un autre écran), maintenez le bouton et parlez. Les appareils en mode silencieux affichent le message sans le jouer.'],
  ['⏳ Capsules temporelles', 'Scellez un message, une photo ou une vidéo jusqu’à une date. Personne ne peut l’ouvrir avant ; le jour venu, une animation apparaît sur tous les écrans.'],
  ['📺 BLC TV Player', 'Touchez la carte BLC TV : choisissez le serveur, la connexion se fait automatiquement, sans identifiant à taper.'],
];

export default function aide(root) {
  root.append(h('h1.page-title', '❓ Aide'), h('p.page-sub', 'Tout ce qu’il faut savoir pour profiter de la maison numérique.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '860px' } }, FAQ.map(([q, a], i) => h('details.glass.card', { open: i === 0 }, h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: '18px' } }, q), h('p', a)))));
}
