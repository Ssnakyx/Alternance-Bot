import "server-only";
import { Document, Font, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { OfferRow, Profile, TailoredCv } from "./types";

// Pas de césure automatique : ses règles sont anglaises et coupent mal les mots français.
Font.registerHyphenationCallback((word) => [word]);

const ACCENT = "#4338ca";
const MUTED = "#475569";

const styles = StyleSheet.create({
  page: { paddingVertical: 32, paddingHorizontal: 38, fontFamily: "Helvetica", fontSize: 9.5, lineHeight: 1.35, color: "#0f172a" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.2 },
  headline: { fontSize: 12, lineHeight: 1.3, color: ACCENT, marginTop: 3 },
  contact: { fontSize: 8.5, color: MUTED, marginTop: 4 },
  section: { marginTop: 11 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: ACCENT,
    letterSpacing: 1,
    textTransform: "uppercase",
    borderBottomWidth: 0.75,
    borderBottomColor: "#c7d2fe",
    paddingBottom: 2,
    marginBottom: 5,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: MUTED },
  item: { marginBottom: 6 },
  bullet: { flexDirection: "row", marginTop: 1.5, paddingLeft: 4 },
  bulletDot: { width: 9 },
  bulletText: { flex: 1 },
  letterPage: { paddingVertical: 56, paddingHorizontal: 64, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.5, color: "#0f172a" },
  paragraph: { marginBottom: 9, textAlign: "justify" },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.filter(Boolean).map((b, i) => (
        <View key={i} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function CvDocument({ profile, cv }: { profile: Pick<Profile, "full_name" | "email" | "phone">; cv: TailoredCv }) {
  const contact = [profile.email, profile.phone, ...cv.contact].filter(Boolean);
  return (
    <Document title={`CV ${profile.full_name}`} author={profile.full_name}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{profile.full_name}</Text>
        {cv.headline && <Text style={styles.headline}>{cv.headline}</Text>}
        {contact.length > 0 && <Text style={styles.contact}>{contact.join("  ·  ")}</Text>}

        {cv.summary && (
          <Section title="Profil">
            <Text>{cv.summary}</Text>
          </Section>
        )}

        {cv.skills.length > 0 && (
          <Section title="Compétences">
            {cv.skills.map((group, i) => (
              <Text key={i} style={{ marginBottom: 2 }}>
                <Text style={styles.bold}>{group.category} : </Text>
                {group.items.join(", ")}
              </Text>
            ))}
          </Section>
        )}

        {cv.experiences.length > 0 && (
          <Section title="Expériences">
            {cv.experiences.map((e, i) => (
              <View key={i} style={styles.item} wrap={false}>
                <View style={styles.row}>
                  <Text>
                    <Text style={styles.bold}>{e.title}</Text>
                    {[e.company, e.location].filter(Boolean).length > 0 && (
                      <Text style={styles.muted}>{`  ·  ${[e.company, e.location].filter(Boolean).join(", ")}`}</Text>
                    )}
                  </Text>
                  <Text style={styles.muted}>{e.period}</Text>
                </View>
                <Bullets items={e.bullets} />
              </View>
            ))}
          </Section>
        )}

        {cv.projects.length > 0 && (
          <Section title="Projets">
            {cv.projects.map((p, i) => (
              <View key={i} style={styles.item} wrap={false}>
                <View style={styles.row}>
                  <Text>
                    <Text style={styles.bold}>{p.name}</Text>
                    {p.stack && <Text style={styles.muted}>{`  ·  ${p.stack}`}</Text>}
                  </Text>
                  {p.link && (
                    <Link src={p.link.startsWith("http") ? p.link : `https://${p.link}`} style={{ color: ACCENT, fontSize: 8.5 }}>
                      {p.link}
                    </Link>
                  )}
                </View>
                <Bullets items={p.bullets} />
              </View>
            ))}
          </Section>
        )}

        {cv.education.length > 0 && (
          <Section title="Formation">
            {cv.education.map((e, i) => (
              <View key={i} style={{ marginBottom: 4 }} wrap={false}>
                <View style={styles.row}>
                  <Text>
                    <Text style={styles.bold}>{e.degree}</Text>
                    {e.school && <Text style={styles.muted}>{`  ·  ${e.school}`}</Text>}
                  </Text>
                  <Text style={styles.muted}>{e.period}</Text>
                </View>
                {e.details && <Text>{e.details}</Text>}
              </View>
            ))}
          </Section>
        )}

        {(cv.languages.length > 0 || cv.interests.length > 0) && (
          <Section title="Langues et centres d'intérêt">
            {cv.languages.length > 0 && (
              <Text>
                <Text style={styles.bold}>Langues : </Text>
                {cv.languages.join(", ")}
              </Text>
            )}
            {cv.interests.length > 0 && (
              <Text>
                <Text style={styles.bold}>Centres d&apos;intérêt : </Text>
                {cv.interests.join(", ")}
              </Text>
            )}
          </Section>
        )}
      </Page>
    </Document>
  );
}

export function renderCvPdf(profile: Pick<Profile, "full_name" | "email" | "phone">, cv: TailoredCv): Promise<Buffer> {
  return renderToBuffer(<CvDocument profile={profile} cv={cv} />);
}

function LetterDocument({
  profile,
  offer,
  title,
  body,
  date,
}: {
  profile: Pick<Profile, "full_name" | "email" | "phone" | "search">;
  offer: Pick<OfferRow, "company" | "location">;
  title: string;
  body: string;
  date: Date;
}) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const place = profile.search.city ? `À ${profile.search.city}, le ` : "Le ";
  return (
    <Document title={`Lettre de motivation ${profile.full_name}`} author={profile.full_name}>
      <Page size="A4" style={styles.letterPage}>
        <View>
          <Text style={styles.bold}>{profile.full_name}</Text>
          {profile.email && <Text>{profile.email}</Text>}
          {profile.phone && <Text>{profile.phone}</Text>}
        </View>
        <View style={{ alignSelf: "flex-end", marginTop: 18, width: 220 }}>
          {offer.company && <Text style={styles.bold}>{offer.company}</Text>}
          {offer.location && <Text>{offer.location}</Text>}
          <Text style={{ marginTop: 14 }}>
            {place}
            {date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}
          </Text>
        </View>
        {title && (
          <Text style={{ marginTop: 26, marginBottom: 18 }}>
            <Text style={styles.bold}>Objet : </Text>
            {title}
          </Text>
        )}
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
        <Text style={{ marginTop: 14, alignSelf: "flex-end" }}>{profile.full_name}</Text>
      </Page>
    </Document>
  );
}

export function renderLetterPdf(opts: {
  profile: Pick<Profile, "full_name" | "email" | "phone" | "search">;
  offer: Pick<OfferRow, "company" | "location">;
  title: string;
  body: string;
  date?: Date;
}): Promise<Buffer> {
  return renderToBuffer(<LetterDocument {...opts} date={opts.date ?? new Date()} />);
}

/** Nom de fichier lisible pour les pièces jointes : "CV - Prénom Nom - Entreprise.pdf". */
export function attachmentName(kind: "CV" | "Lettre de motivation", fullName: string, company: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${[kind, clean(fullName), clean(company)].filter(Boolean).join(" - ")}.pdf`;
}

/** Réponse HTTP qui affiche le PDF dans le navigateur, avec un nom de fichier propre au téléchargement. */
export function pdfResponse(pdf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
