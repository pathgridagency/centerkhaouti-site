# Centre Khaouti — mise en route du back-office

Le site reste en HTML statique (hébergé sur Vercel). Les données (patients, rendez-vous,
devis, encaissements, charges) sont dans **Supabase** (base PostgreSQL + connexion sécurisée).

## 1. Créer la base (10 minutes, une seule fois)

1. Sur <https://supabase.com>, créez un projet (région **Europe**, ex. Frankfurt/Paris).
2. **SQL Editor → New query** : collez tout le fichier `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email** : désactivez **« Allow new users to sign up »**
   (seuls les comptes que vous créez pourront se connecter).
4. **Authentication → Users → Add user** : créez le compte de Khadija (email + mot de passe, cochez *Auto confirm*).
5. Retour dans **SQL Editor**, autorisez ce compte (remplacez l'email) :

   ```sql
   insert into public.staff (user_id, full_name)
   select id, 'Khadija Khaouti' from auth.users where email = 'email-de-khadija@exemple.com';
   ```

   Même opération pour chaque personne de l'équipe qui doit accéder à l'administration.

## 2. Brancher le site

Dans **Project Settings → API**, copiez *Project URL* et la clé **anon / publishable**, puis
renseignez-les dans `assets/js/config.js`. (Jamais la clé `service_role`.)

## 3. Utilisation

- Administration : `https://votre-site/admin/`
- Commencez par **Paramètres** : prix des prestations, ICE / IF / Patente (imprimés en bas des devis),
  horaires, nombre de patients pris en parallèle, fermetures (Aïd, congés).
- Les réservations du site arrivent **« En attente »** dans *Rendez-vous* : confirmez-les
  (la fiche patient est créée automatiquement) puis envoyez la confirmation WhatsApp en un clic.
- Devis : *Devis → Nouveau devis* → **Imprimer / PDF** (A4 avec logo, signé KHADIJA KHAOUTI,
  montant en lettres). Les paiements se saisissent avec **+ Encaissement**.

## Notes

- Fuseau horaire des créneaux en ligne : Africa/Casablanca.
- Données de santé : déclarez le traitement à la **CNDP** (loi 09-08) et mentionnez la prise de
  rendez-vous en ligne dans la politique de confidentialité.
- Sauvegardes : le plan gratuit Supabase n'a pas de sauvegarde automatique téléchargeable — exportez
  régulièrement (boutons *Exporter CSV*) ou passez au plan Pro.
- Le plan gratuit met le projet en pause après 7 jours sans aucune activité ; une utilisation
  quotidienne suffit à l'éviter.
