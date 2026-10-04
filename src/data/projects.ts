import type { Project } from '@/types'
import { isoAgo, paddedId } from './seed'

/**
 * Client engagements.
 *
 * Owners are user ids (`usr-001` …), matching the ids produced by `createUsers`,
 * so every "owner" chip in the UI resolves to a real person.
 */

interface ProjectSeed {
  name: string
  client: string
  assessmentType: Project['assessmentType']
  status: Project['status']
  ownerIndex: number
  startDaysAgo: number
  durationDays: number
  description: string
}

const PROJECT_SEEDS: ProjectSeed[] = [
  {
    name: 'Northwind Retail — Storefront Reassessment',
    client: 'Northwind Retail Group',
    assessmentType: 'web_application',
    status: 'active',
    ownerIndex: 0,
    startDaysAgo: 12,
    durationDays: 28,
    description:
      'Annual retest of the customer storefront following the 2026 payment gateway migration, plus assessment of the new loyalty wallet.',
  },
  {
    name: 'Helix Biologics — Partner API Review',
    client: 'Helix Biologics',
    assessmentType: 'api',
    status: 'active',
    ownerIndex: 2,
    startDaysAgo: 5,
    durationDays: 24,
    description:
      'Black-box and grey-box testing of the clinical trial partner API ahead of the third-party integration launch.',
  },
  {
    name: 'Orbit Freight — Mobile Backend',
    client: 'Orbit Freight Logistics',
    assessmentType: 'mobile_backend',
    status: 'active',
    ownerIndex: 0,
    startDaysAgo: 21,
    durationDays: 30,
    description:
      'Backend API and admin surface behind the driver and depot mobile applications, including push notification and offline sync endpoints.',
  },
  {
    name: 'Kestrel Bank — Infrastructure Baseline',
    client: 'Kestrel Financial',
    assessmentType: 'infrastructure',
    status: 'paused',
    ownerIndex: 2,
    startDaysAgo: 46,
    durationDays: 35,
    description:
      'External attack-surface and infrastructure review paused at client request pending a datacentre migration window.',
  },
  {
    name: 'Verity Health — Portal Penetration Test',
    client: 'Verity Health Systems',
    assessmentType: 'web_application',
    status: 'active',
    ownerIndex: 5,
    startDaysAgo: 8,
    durationDays: 21,
    description:
      'Patient portal and appointment scheduling application, with emphasis on session handling and record-level access control.',
  },
  {
    name: 'Lumen Retail — Checkout Hardening',
    client: 'Lumen Retail',
    assessmentType: 'web_application',
    status: 'active',
    ownerIndex: 3,
    startDaysAgo: 3,
    durationDays: 18,
    description:
      'Focused assessment of the new unified checkout, discount engine and fulfilment integrations after a penetration test in early 2026.',
  },
  {
    name: 'Solstice Media — Content Platform',
    client: 'Solstice Media Group',
    assessmentType: 'web_application',
    status: 'planning',
    ownerIndex: 6,
    startDaysAgo: 2,
    durationDays: 35,
    description:
      'Assessment of the migrated publishing platform, including contributor workflows, media library and the public content API.',
  },
  {
    name: 'Ardent Logistics — Red Team Exercise',
    client: 'Ardent Logistics',
    assessmentType: 'red_team',
    status: 'active',
    ownerIndex: 2,
    startDaysAgo: 30,
    durationDays: 21,
    description:
      'Adversary simulation against the freight operations estate, covering initial access, lateral movement and detection coverage.',
  },
  {
    name: 'Cobalt Energy — Grid Portal Review',
    client: 'Cobalt Energy',
    assessmentType: 'web_application',
    status: 'completed',
    ownerIndex: 4,
    startDaysAgo: 96,
    durationDays: 25,
    description:
      'Field engineer portal and telemetry dashboards, completed with a full retest of all high and critical findings.',
  },
  {
    name: 'Perch Payments — API Assessment',
    client: 'Perch Payments',
    assessmentType: 'api',
    status: 'completed',
    ownerIndex: 0,
    startDaysAgo: 128,
    durationDays: 28,
    description:
      'Full API security assessment of the payments platform, including the merchant onboarding and settlement endpoints.',
  },
  {
    name: 'Halcyon Travel — Booking Platform',
    client: 'Halcyon Travel Group',
    assessmentType: 'web_application',
    status: 'completed',
    ownerIndex: 3,
    startDaysAgo: 151,
    durationDays: 22,
    description:
      'Public booking engine, loyalty programme and back-office tooling, closed out with executive reporting and remediation verification.',
  },
  {
    name: 'Tessera Learning — Internal Tools',
    client: 'Tessera Learning',
    assessmentType: 'infrastructure',
    status: 'completed',
    ownerIndex: 5,
    startDaysAgo: 74,
    durationDays: 20,
    description:
      'Internal assessment tooling and administration interfaces used by the learning operations team, delivered under a fixed-scope statement of work.',
  },
]

export function createProjects(): Project[] {
  return PROJECT_SEEDS.map((seed, index) => {
    const endOffset = seed.startDaysAgo - seed.durationDays
    return {
      id: paddedId('prj', index + 1, 3),
      name: seed.name,
      client: seed.client,
      description: seed.description,
      assessmentType: seed.assessmentType,
      status: seed.status,
      startDate: isoAgo(seed.startDaysAgo).slice(0, 10),
      endDate: isoAgo(Math.max(0, endOffset)).slice(0, 10),
      owner: paddedId('usr', seed.ownerIndex + 1, 3),
      createdAt: isoAgo(seed.startDaysAgo + 2, 4),
      updatedAt: isoAgo(Math.max(0, Math.min(seed.startDaysAgo, 6)), 5),
    }
  })
}
