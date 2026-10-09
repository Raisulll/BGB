// Copied verbatim from BGB/src/data/seed.js on 2026-10-08 (CLAUDE.md §18).
// The frontend copy will be deleted once it reads from the API; this file is the seed source of truth.

// ============ STATIC REFERENCE DATA & SEED RECORDS ============

export const USERS = [
  { id: 'U001', username: 'hq_admin', password: 'Admin@123', name: 'Col. Rahman', role: 'HQ Administrator', scope: 'HQ', email: 'rahman@bgb.gov.bd' },
  { id: 'U002', username: 'sector_off', password: 'Sector@123', name: 'Lt. Col. Karim', role: 'Sector Officer', scope: 'Sector-7', email: 'karim@bgb.gov.bd' },
  { id: 'U003', username: 'batt_op', password: 'Batt@123', name: 'Capt. Hasan', role: 'Battalion Operator', scope: '17 BGB', email: 'hasan@bgb.gov.bd' },
  { id: 'U004', username: 'verifier', password: 'Verify@123', name: 'Maj. Alam', role: 'Verifier/Approver', scope: 'Sector-7', email: 'alam@bgb.gov.bd' },
  { id: 'U005', username: 'auditor', password: 'Audit@123', name: 'SSM. Islam', role: 'Auditor', scope: 'HQ', email: 'islam@bgb.gov.bd' },
];

export const ROLES = ['HQ Administrator', 'Sector Officer', 'Battalion Operator', 'Verifier/Approver', 'Auditor'];

export const ORG_HIERARCHY = {
  HQ: {
    'Sector-7': {
      '17 BGB': { BOPs: ['BOP Teknaf', 'BOP Ghumdhum', 'BOP Himchari', 'BOP Teknaf River'] },
      '34 BGB': { BOPs: ['BOP Rangamati', 'BOP Khagrachari', 'BOP Bandarban'] },
      '42 BGB': { BOPs: ['BOP Comilla', 'BOP Feni', 'BOP Noakhali'] },
    },
    'Sector-11': {
      '8 BGB': { BOPs: ['BOP Benapole', 'BOP Jhenaidah', 'BOP Jessore'] },
      '21 BGB': { BOPs: ['BOP Rajshahi', 'BOP Natore', 'BOP Pabna'] },
    },
  },
};

export const INCIDENT_CATEGORIES = [
  { id: 'CAT01', name: 'Smuggling', subcategories: ['Yaba/Ice', 'Phensedyl', 'Alcohol', 'Gold', 'Electronics', 'Livestock', 'Other'] },
  { id: 'CAT02', name: 'Illegal Crossing', subcategories: ['Entry without documents', 'Exit without documents', 'Overstay', 'Route violation'] },
  { id: 'CAT03', name: 'Arms & Ammunition', subcategories: ['Firearms', 'Ammunition', 'Explosives', 'Sharp weapons'] },
  { id: 'CAT04', name: 'Human Trafficking', subcategories: ['Rohingya trafficking', 'Labor trafficking', 'Child trafficking'] },
  { id: 'CAT05', name: 'Border Infrastructure', subcategories: ['Fence damage', 'Pillar damage', 'Road damage', 'Other'] },
  { id: 'CAT06', name: 'Security Threat', subcategories: ['Suspicious movement', 'Drone sighting', 'Trespassing', 'Hostile activity'] },
  { id: 'CAT07', name: 'Other', subcategories: ['Rescue operation', 'Natural disaster', 'Medical emergency', 'Other'] },
];

export const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
export const WORKFLOW_STAGES = ['Draft', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed'];
export const ALL_STATUSES = [...WORKFLOW_STAGES, 'Returned', 'Rejected'];

export const PASSWORD_POLICY = { minLength: 8, requireUppercase: true, requireNumber: true, requireSpecial: true, maxAttempts: 5, lockoutMinutes: 15 };
export const SESSION_TIMEOUT = 30;
export const DATA_RETENTION_DAYS = 3650;

export const SEED_INCIDENTS = [
  {
    id: 'BIRDS-2026-1001', title: 'Yaba Seizure at Teknaf', category: 'Smuggling', subcategory: 'Yaba/Ice',
    severity: 'High', status: 'Approved', date: '2026-10-15', time: '03:45',
    location: 'Teknaf Border Area', bop: 'BOP Teknaf', sector: 'Sector-7', battalion: '17 BGB',
    lat: 20.8743, lng: 92.2683,
    description: 'Border patrol team intercepted 3 individuals attempting to smuggle approximately 5000 pills of Yaba through the fence gap near pillar no. 34/2.',
    personsInvolved: '3 smugglers apprehended', actionTaken: 'Seizure made, suspects handed to Teknaf Police', outcome: 'Drugs seized, case registered',
    createdBy: 'U003', createdAt: '2026-10-15T04:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-15 04:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-15 04:15', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-15 09:30', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-15 14:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-16 10:00', status: 'Approved' },
    ],
    evidence: [
      { name: 'seizure_photo_01.jpg', type: 'image', size: '2.4 MB', date: '2026-10-15', metadata: 'Canon EOS 80D, 2026-10-15 03:50:12' },
      { name: 'incident_report.pdf', type: 'pdf', size: '1.1 MB', date: '2026-10-15', metadata: 'Created by Capt. Hasan' },
    ],
  },
  {
    id: 'BIRDS-2026-1002', title: 'Fence Damage Near Pillar 42/5', category: 'Border Infrastructure', subcategory: 'Fence damage',
    severity: 'Medium', status: 'Submitted', date: '2026-10-18', time: '14:20',
    location: 'Ghumdhum Border Area', bop: 'BOP Ghumdhum', sector: 'Sector-7', battalion: '17 BGB',
    lat: 21.45, lng: 92.05,
    description: 'Approximately 15 feet of border fence damaged due to flash flood. Gap identified near pillar 42/5.',
    personsInvolved: 'N/A', actionTaken: 'Temporary barrier erected, report sent to engineering section', outcome: 'Pending repair',
    createdBy: 'U003', createdAt: '2026-10-18T14:30:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-18 14:30', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-18 15:00', status: 'Submitted' },
    ],
    evidence: [
      { name: 'fence_damage.jpg', type: 'image', size: '3.1 MB', date: '2026-10-18', metadata: 'Samsung Galaxy S23, 2026-10-18 14:25:00' },
    ],
  },
  {
    id: 'BIRDS-2026-1003', title: 'Suspicious Drone Activity', category: 'Security Threat', subcategory: 'Drone sighting',
    severity: 'Critical', status: 'Reviewed', date: '2026-10-20', time: '22:10',
    location: 'Himchari Border Area', bop: 'BOP Himchari', sector: 'Sector-7', battalion: '17 BGB',
    lat: 21.4, lng: 92.01,
    description: 'Unidentified drone observed flying over border area for approximately 20 minutes. Drone appeared to be conducting surveillance.',
    personsInvolved: 'Unknown operators', actionTaken: 'Alert raised, anti-drone team deployed, area secured', outcome: 'Under investigation',
    createdBy: 'U003', createdAt: '2026-10-20T22:30:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-20 22:30', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-20 22:45', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-21 08:00', status: 'Reviewed' },
    ],
    evidence: [
      { name: 'drone_video.mp4', type: 'video', size: '45.2 MB', date: '2026-10-20', metadata: 'CCTV Camera #7, 2026-10-20 22:10:00' },
      { name: 'radar_screenshot.png', type: 'image', size: '890 KB', date: '2026-10-20', metadata: 'Radar System v3.2' },
    ],
  },
  {
    id: 'BIRDS-2026-1004', title: 'Illegal Crossing Attempt', category: 'Illegal Crossing', subcategory: 'Entry without documents',
    severity: 'Medium', status: 'Closed', date: '2026-10-10', time: '01:30',
    location: 'Benapole Border Area', bop: 'BOP Benapole', sector: 'Sector-11', battalion: '8 BGB',
    lat: 23.8, lng: 88.75,
    description: 'Group of 5 individuals attempted illegal entry through non-designated route.',
    personsInvolved: '5 individuals (Myanmar nationals)', actionTaken: 'Apprehended, handed to immigration', outcome: 'Deported',
    createdBy: 'U003', createdAt: '2026-10-10T02:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-10 02:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-10 02:15', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-10 09:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-10 14:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-11 10:00', status: 'Approved' },
      { action: 'Closed', user: 'Col. Rahman', date: '2026-10-12 09:00', status: 'Closed' },
    ],
    evidence: [],
  },
  {
    id: 'BIRDS-2026-1005', title: 'Phensedyl Seizure', category: 'Smuggling', subcategory: 'Phensedyl',
    severity: 'High', status: 'Draft', date: '2026-10-22', time: '05:15',
    location: 'Rangamati Border Area', bop: 'BOP Rangamati', sector: 'Sector-7', battalion: '34 BGB',
    lat: 22.73, lng: 92.2,
    description: 'Intelligence received about Phensedyl smuggling through river route.',
    personsInvolved: 'TBD', actionTaken: 'Patrol enhanced', outcome: 'Pending',
    createdBy: 'U003', createdAt: '2026-10-22T05:30:00',
    timeline: [{ action: 'Created', user: 'Capt. Hasan', date: '2026-10-22 05:30', status: 'Draft' }],
    evidence: [],
  },
  {
    id: 'BIRDS-2026-1006', title: 'Gold Bar Seizure at Benapole Checkpost', category: 'Smuggling', subcategory: 'Gold',
    severity: 'High', status: 'Approved', date: '2026-10-21', time: '11:15',
    location: 'Benapole Land Port Checkpost', bop: 'BOP Benapole', sector: 'Sector-11', battalion: '8 BGB',
    lat: 23.0423, lng: 88.8951,
    description: 'Special intelligence operation intercepted 12 gold bars weighing 1.4 kg hidden inside modified motorcycle fuel tank near main land port checkpost.',
    personsInvolved: '1 smuggler apprehended', actionTaken: 'Seized gold handed over to Custom House, suspect transferred to Benapole Port Police', outcome: 'Case registered under Special Powers Act',
    createdBy: 'U003', createdAt: '2026-10-21T11:30:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-21 11:30', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-21 11:45', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-21 14:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-21 17:30', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-22 09:00', status: 'Approved' },
    ],
    evidence: [
      { name: 'gold_bars_seizure.jpg', type: 'image', size: '4.2 MB', date: '2026-10-21', metadata: 'Nikon D750, 2026-10-21 11:20:05' },
      { name: 'customs_receipt.pdf', type: 'pdf', size: '820 KB', date: '2026-10-21', metadata: 'Customs Officer Clearance' },
    ],
  },
  {
    id: 'BIRDS-2026-1007', title: 'Cattle Smuggling Intercepted at Padma Riverbed', category: 'Smuggling', subcategory: 'Livestock',
    severity: 'Medium', status: 'Verified', date: '2026-10-19', time: '02:40',
    location: 'Padma River Char Area', bop: 'BOP Rajshahi', sector: 'Sector-11', battalion: '21 BGB',
    lat: 24.3636, lng: 88.6241,
    description: 'Patrol squad intercepted 15 smuggled Indian cattle crossing Padma river char near Pillar 75/3-S. Smugglers fled taking advantage of dense fog.',
    personsInvolved: 'Smugglers fled', actionTaken: 'Cattle seized and handed over to Customs warehouse', outcome: 'Auction scheduled by Customs',
    createdBy: 'U003', createdAt: '2026-10-19T03:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-19 03:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-19 03:20', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-19 10:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-19 15:30', status: 'Verified' },
    ],
    evidence: [
      { name: 'cattle_seizure.jpg', type: 'image', size: '2.8 MB', date: '2026-10-19', metadata: 'FLIR Thermal Camera Image' },
    ],
  },
  {
    id: 'BIRDS-2026-1008', title: 'Crystal Meth (Ice) Night Interception at Naf River', category: 'Smuggling', subcategory: 'Yaba/Ice',
    severity: 'Critical', status: 'Reviewed', date: '2026-10-23', time: '01:10',
    location: 'Jaliapara Naf River Route', bop: 'BOP Teknaf River', sector: 'Sector-7', battalion: '17 BGB',
    lat: 20.8651, lng: 92.2984,
    description: 'Joint amphibious ambush team recovered 2.5 kg Crystal Methamphetamine (Ice) worth BDT 12.5 Crore from a wooden engine boat near Jaliapara border point.',
    personsInvolved: '2 suspects jumped into river', actionTaken: 'Contraband seized, search operation ongoing in river tributaries', outcome: 'High-value seizure recorded',
    createdBy: 'U003', createdAt: '2026-10-23T02:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-23 02:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-23 02:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-23 08:30', status: 'Reviewed' },
    ],
    evidence: [
      { name: 'ice_packets.jpg', type: 'image', size: '5.1 MB', date: '2026-10-23', metadata: 'Night Vision Patrol Cam #3' },
      { name: 'forensic_report.pdf', type: 'pdf', size: '1.4 MB', date: '2026-10-23', metadata: 'DNC Lab Analysis' },
    ],
  },
  {
    id: 'BIRDS-2026-1009', title: 'Maritime Human Trafficking Group Apprehended', category: 'Human Trafficking', subcategory: 'Rohingya trafficking',
    severity: 'High', status: 'Approved', date: '2026-10-14', time: '04:30',
    location: 'Teknaf Coastal Area', bop: 'BOP Teknaf', sector: 'Sector-7', battalion: '17 BGB',
    lat: 20.885, lng: 92.25,
    description: 'Apprehended 18 individuals including 4 illegal brokers organizing maritime illegal trafficking route to Malaysia via deep sea fishing trawler.',
    personsInvolved: '14 victims + 4 traffickers', actionTaken: 'Traffickers arrested, victims sent to refugee camp security committee', outcome: 'Human trafficking case filed',
    createdBy: 'U003', createdAt: '2026-10-14T05:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-14 05:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-14 05:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-14 11:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-14 16:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-15 09:30', status: 'Approved' },
    ],
    evidence: [
      { name: 'trawler_seizure.jpg', type: 'image', size: '3.6 MB', date: '2026-10-14', metadata: 'Coast Guard Radar Log' },
    ],
  },
  {
    id: 'BIRDS-2026-1010', title: 'Unlawful BSF Fence Border Crossing Sighting', category: 'Security Threat', subcategory: 'Suspicious movement',
    severity: 'High', status: 'Submitted', date: '2026-10-22', time: '16:45',
    location: 'Pillar 39/2 Zero Line', bop: 'BOP Jessore', sector: 'Sector-11', battalion: '8 BGB',
    lat: 23.1667, lng: 89.2083,
    description: 'Border patrol observed 4 armed BSF personnel advancing 60 yards into Bangladesh zero line near Pillar 39/2. Strong verbal protest lodged and flag meeting called.',
    personsInvolved: '4 BSF personnel', actionTaken: 'Flag meeting requested at Battalion Commander level', outcome: 'Flag meeting scheduled',
    createdBy: 'U003', createdAt: '2026-10-22T17:15:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-22 17:15', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-22 17:30', status: 'Submitted' },
    ],
    evidence: [
      { name: 'camera_log_39.jpg', type: 'image', size: '1.9 MB', date: '2026-10-22', metadata: 'Surveillance Post Camera' },
    ],
  },
  {
    id: 'BIRDS-2026-1011', title: 'Arms & Live Ammunition Crate Recovered in Hill Cave', category: 'Arms & Ammunition', subcategory: 'Firearms',
    severity: 'Critical', status: 'Approved', date: '2026-10-08', time: '10:00',
    location: 'Khagrachari Hill Ravine', bop: 'BOP Khagrachari', sector: 'Sector-7', battalion: '34 BGB',
    lat: 23.1079, lng: 91.9689,
    description: 'Special operation team seized 2 local-made pistols, 1 foreign revolver, and 24 rounds of live 9mm ammunition hidden in a remote hill ravine.',
    personsInvolved: 'Abandoned weapons cache', actionTaken: 'Weapons handed over to Khagrachari Police Station', outcome: 'Arms case registered',
    createdBy: 'U003', createdAt: '2026-10-08T10:30:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-08 10:30', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-08 11:00', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-08 15:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-09 10:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-09 14:00', status: 'Approved' },
    ],
    evidence: [
      { name: 'arms_seizure.jpg', type: 'image', size: '4.8 MB', date: '2026-10-08', metadata: 'BGB Recon Team Photo' },
    ],
  },
  {
    id: 'BIRDS-2026-1012', title: 'Landslide Displaces Border Pillar 56/4-S', category: 'Border Infrastructure', subcategory: 'Pillar damage',
    severity: 'Medium', status: 'Verified', date: '2026-10-12', time: '08:15',
    location: 'Bandarban Hill Border', bop: 'BOP Bandarban', sector: 'Sector-7', battalion: '34 BGB',
    lat: 21.8311, lng: 92.3686,
    description: 'Severe monsoon hill wash displaced primary pillar 56/4-S down slope by 12 meters. Survey section deployed for GPS marking and temporary securing.',
    personsInvolved: 'N/A', actionTaken: 'Joint GPS survey conducted, re-erection proposal sent to Survey of Bangladesh', outcome: 'Re-erection in progress',
    createdBy: 'U003', createdAt: '2026-10-12T09:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-12 09:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-12 09:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-12 14:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-13 11:00', status: 'Verified' },
    ],
    evidence: [
      { name: 'pillar_displacement.jpg', type: 'image', size: '3.3 MB', date: '2026-10-12', metadata: 'Survey Section Cam' },
    ],
  },
  {
    id: 'BIRDS-2026-1013', title: 'Phensedyl Consignment Seizure at Feni River Route', category: 'Smuggling', subcategory: 'Phensedyl',
    severity: 'High', status: 'Closed', date: '2026-10-05', time: '03:20',
    location: 'Feni Border Canal', bop: 'BOP Feni', sector: 'Sector-7', battalion: '42 BGB',
    lat: 23.0159, lng: 91.3976,
    description: 'Night ambush seized 420 bottles of Indian Phensedyl concealed inside jute sacks being transported via border canal.',
    personsInvolved: 'Smugglers escaped into darkness', actionTaken: 'Seized narcotics destroyed as per judicial protocol', outcome: 'Narcotics destroyed',
    createdBy: 'U003', createdAt: '2026-10-05T04:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-05 04:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-05 04:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-05 10:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-05 16:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-06 09:00', status: 'Approved' },
      { action: 'Closed', user: 'Col. Rahman', date: '2026-10-07 10:00', status: 'Closed' },
    ],
    evidence: [],
  },
  {
    id: 'BIRDS-2026-1014', title: 'Flood Emergency Relief & Rescue of Stranded Villagers', category: 'Other', subcategory: 'Rescue operation',
    severity: 'Low', status: 'Closed', date: '2026-10-02', time: '12:00',
    location: 'Comilla Zero Line Embankment', bop: 'BOP Comilla', sector: 'Sector-7', battalion: '42 BGB',
    lat: 23.4607, lng: 91.1809,
    description: 'BGB watercraft unit successfully rescued 14 villagers including 3 children stranded near flooded zero-line embankment.',
    personsInvolved: '14 rescued local residents', actionTaken: 'Rescued villagers provided emergency rations & medical aid', outcome: 'Operation successfully finished',
    createdBy: 'U003', createdAt: '2026-10-02T13:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-02 13:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-02 13:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-02 16:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-03 09:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-03 14:00', status: 'Approved' },
      { action: 'Closed', user: 'Col. Rahman', date: '2026-10-04 10:00', status: 'Closed' },
    ],
    evidence: [],
  },
  {
    id: 'BIRDS-2026-1015', title: 'High-altitude Quadcopter Drone Intrusion', category: 'Security Threat', subcategory: 'Drone sighting',
    severity: 'Critical', status: 'Submitted', date: '2026-10-24', time: '21:15',
    location: 'Natore Border Sector', bop: 'BOP Natore', sector: 'Sector-11', battalion: '21 BGB',
    lat: 24.4102, lng: 89.0076,
    description: 'Thermal imaging camera recorded an unidentified quadcopter hovering at 150m height for 12 minutes over border outpost sector.',
    personsInvolved: 'Unknown drone operator', actionTaken: 'Anti-drone jammer activated, radar log preserved', outcome: 'Under investigative review',
    createdBy: 'U003', createdAt: '2026-10-24T21:45:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-24 21:45', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-24 22:00', status: 'Submitted' },
    ],
    evidence: [
      { name: 'thermal_drone_log.mp4', type: 'video', size: '38.4 MB', date: '2026-10-24', metadata: 'Thermal Sight #2 Log' },
    ],
  },
  {
    id: 'BIRDS-2026-1016', title: 'Phensedyl & Narcotics Consignment Interception', category: 'Smuggling', subcategory: 'Phensedyl',
    severity: 'High', status: 'Approved', date: '2026-10-20', time: '02:15',
    location: 'Comilla Zero Line Outpost', bop: 'BOP Comilla', sector: 'Sector-7', battalion: '42 BGB',
    lat: 23.4607, lng: 91.1809,
    description: 'Night ambush squad intercepted 350 bottles of contraband Phensedyl syrup smuggled across the Comilla zero line.',
    personsInvolved: '2 suspects apprehended', actionTaken: 'Contraband seized, case filed at Kotwali PS', outcome: 'Suspects in police custody',
    createdBy: 'U003', createdAt: '2026-10-20T03:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-20 03:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-20 03:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-20 09:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-20 14:00', status: 'Verified' },
      { action: 'Approved', user: 'Maj. Alam', date: '2026-10-21 10:00', status: 'Approved' },
    ],
    evidence: [
      { name: 'comilla_seizure_01.jpg', type: 'image', size: '2.1 MB', date: '2026-10-20', metadata: 'Patrol Cam #4' },
    ],
  },
  {
    id: 'BIRDS-2026-1017', title: 'Border Pillar 2084/2-S Vandalism & Trespassing', category: 'Border Infrastructure', subcategory: 'Pillar damage',
    severity: 'Medium', status: 'Verified', date: '2026-10-25', time: '15:30',
    location: 'Comilla Border Sector', bop: 'BOP Comilla', sector: 'Sector-7', battalion: '42 BGB',
    lat: 23.4607, lng: 91.1809,
    description: 'Border patrol identified minor damage and cement chipping on primary pillar 2084/2-S. Flag meeting requested with local counterparts.',
    personsInvolved: 'Unknown miscreants', actionTaken: 'Pillar area secured, repair ticket logged with engineering squad', outcome: 'Flag meeting scheduled',
    createdBy: 'U003', createdAt: '2026-10-25T16:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-25 16:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-25 16:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-25 19:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-26 09:00', status: 'Verified' },
    ],
    evidence: [
      { name: 'pillar_damage_comilla.jpg', type: 'image', size: '3.4 MB', date: '2026-10-25', metadata: 'BOP Survey Cam' },
    ],
  },
  {
    id: 'BIRDS-2026-1018', title: 'Fake Currency & Smuggled Electronics Interception', category: 'Smuggling', subcategory: 'Electronics',
    severity: 'High', status: 'Submitted', date: '2026-10-23', time: '11:00',
    location: 'Benapole Checkpost Sector', bop: 'BOP Benapole', sector: 'Sector-11', battalion: '8 BGB',
    lat: 23.8, lng: 88.75,
    description: 'BGB search squad intercepted fake currency notes worth BDT 4.5 Lakh and 15 smuggled smartphones at Benapole border point.',
    personsInvolved: '1 smuggler arrested', actionTaken: 'Suspect handed to Benapole Port Police', outcome: 'Under investigation',
    createdBy: 'U003', createdAt: '2026-10-23T11:30:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-23 11:30', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-23 12:00', status: 'Submitted' },
    ],
    evidence: [
      { name: 'fake_notes_seizure.jpg', type: 'image', size: '2.9 MB', date: '2026-10-23', metadata: 'Checkpost Cam Log' },
    ],
  },
  {
    id: 'BIRDS-2026-1019', title: 'Firearms & Ammunition Smuggling Intercepted', category: 'Arms & Ammunition', subcategory: 'Firearms',
    severity: 'Critical', status: 'Reviewed', date: '2026-10-24', time: '04:10',
    location: 'Teknaf Coastal Patrol Point', bop: 'BOP Teknaf', sector: 'Sector-7', battalion: '17 BGB',
    lat: 20.8743, lng: 92.2683,
    description: 'Ambush patrol seized 1 foreign pistol and 16 live rounds from a bag abandoned near the Teknaf fence border gap.',
    personsInvolved: 'Smugglers fled into thickets', actionTaken: 'Arms case filed, search operation launched', outcome: 'Arms in BGB custody',
    createdBy: 'U003', createdAt: '2026-10-24T05:00:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-24 05:00', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-24 05:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-24 09:30', status: 'Reviewed' },
    ],
    evidence: [
      { name: 'teknaf_pistol.jpg', type: 'image', size: '4.1 MB', date: '2026-10-24', metadata: 'Night Ambush Photo' },
    ],
  },
  {
    id: 'BIRDS-2026-1020', title: 'Night Infiltration Intercepted at Padma Char', category: 'Illegal Crossing', subcategory: 'Entry without documents',
    severity: 'Medium', status: 'Verified', date: '2026-10-22', time: '23:45',
    location: 'Padma Riverbed Sector', bop: 'BOP Rajshahi', sector: 'Sector-11', battalion: '21 BGB',
    lat: 24.3636, lng: 88.6241,
    description: 'BGB river patrol intercepted a group of 4 individuals attempting illegal river crossing near Padma char point.',
    personsInvolved: '4 individuals detained', actionTaken: 'Detained individuals handed to local police station', outcome: 'Case logged',
    createdBy: 'U003', createdAt: '2026-10-23T00:15:00',
    timeline: [
      { action: 'Created', user: 'Capt. Hasan', date: '2026-10-23 00:15', status: 'Draft' },
      { action: 'Submitted', user: 'Capt. Hasan', date: '2026-10-23 00:30', status: 'Submitted' },
      { action: 'Reviewed', user: 'Lt. Col. Karim', date: '2026-10-23 08:00', status: 'Reviewed' },
      { action: 'Verified', user: 'Maj. Alam', date: '2026-10-23 14:00', status: 'Verified' },
    ],
    evidence: [],
  },
];

export const SEED_AUDIT_LOG = [
  { id: 1, timestamp: '2026-10-06 08:00:15', user: 'hq_admin', action: 'LOGIN', details: 'Successful login from 10.0.1.50 (TLS 1.3)', ip: '10.0.1.50' },
  { id: 2, timestamp: '2026-10-06 08:05:30', user: 'hq_admin', action: 'CREATE_USER', details: 'Created user: batt_op (17 BGB Unit Operator)', ip: '10.0.1.50' },
  { id: 3, timestamp: '2026-10-06 08:10:00', user: 'batt_op', action: 'LOGIN', details: 'Successful login from 10.0.2.15', ip: '10.0.2.15' },
  { id: 4, timestamp: '2026-10-06 08:15:22', user: 'batt_op', action: 'CREATE_INCIDENT', details: 'Created BIRDS-2026-1005 (Phensedyl Seizure)', ip: '10.0.2.15' },
  { id: 5, timestamp: '2026-10-06 09:00:00', user: 'sector_off', action: 'LOGIN', details: 'Successful login from 10.0.3.10', ip: '10.0.3.10' },
  { id: 6, timestamp: '2026-10-06 09:15:00', user: 'sector_off', action: 'REVIEW_INCIDENT', details: 'Reviewed BIRDS-2026-1003 (Suspicious Drone Activity)', ip: '10.0.3.10' },
  { id: 7, timestamp: '2026-10-06 09:30:00', user: 'auditor', action: 'LOGIN', details: 'Successful login from 10.0.1.55', ip: '10.0.1.55' },
  { id: 8, timestamp: '2026-10-06 09:35:00', user: 'auditor', action: 'VIEW_AUDIT_LOG', details: 'Accessed immutable system audit trail', ip: '10.0.1.55' },
  { id: 9, timestamp: '2026-10-06 10:00:00', user: 'verifier', action: 'LOGIN', details: 'Successful login from 10.0.3.20', ip: '10.0.3.20' },
  { id: 10, timestamp: '2026-10-06 10:15:00', user: 'verifier', action: 'APPROVE_INCIDENT', details: 'Approved BIRDS-2026-1001 (Teknaf Yaba Seizure)', ip: '10.0.3.20' },
  { id: 11, timestamp: '2026-10-06 11:20:10', user: 'hq_admin', action: 'ROLE_CHANGE', details: 'Updated role permissions matrix for Sector Officer', ip: '10.0.1.50' },
  { id: 12, timestamp: '2026-10-06 12:45:00', user: 'batt_op', action: 'CREATE_INCIDENT', details: 'Created BIRDS-2026-1016 (Comilla Phensedyl Seizure)', ip: '10.0.2.15' },
  { id: 13, timestamp: '2026-10-06 14:10:05', user: 'hq_admin', action: 'PASSWORD_RESET', details: 'Generated temporary password for user: verifier', ip: '10.0.1.50' },
  { id: 14, timestamp: '2026-10-06 15:30:40', user: 'verifier', action: 'VERIFY_INCIDENT', details: 'Verified BIRDS-2026-1017 (Comilla Pillar Damage)', ip: '10.0.3.20' },
  { id: 15, timestamp: '2026-10-06 16:50:12', user: 'auditor', action: 'EXPORT_REPORT', details: 'Exported Operational Intelligence Report CSV', ip: '10.0.1.55' },
];

export const SEED_NOTIFICATIONS = [
  { id: 1, title: 'New Incident Submitted', message: 'BIRDS-2026-1017 submitted by Capt. Hasan', time: '2 hours ago', read: false, type: 'submission' },
  { id: 2, title: 'Incident Reviewed', message: 'BIRDS-2026-1019 reviewed by Lt. Col. Karim', time: '5 hours ago', read: false, type: 'review' },
  { id: 3, title: 'Incident Approved', message: 'BIRDS-2026-1016 approved by Maj. Alam', time: '1 day ago', read: true, type: 'approval' },
  { id: 4, title: 'Incident Returned', message: 'BIRDS-2026-1005 returned for corrections', time: '2 days ago', read: true, type: 'return' },
];

export const NEXT_INCIDENT_ID = 1021;

