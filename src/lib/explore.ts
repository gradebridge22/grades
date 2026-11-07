/**
 * "Explore interests" — MOCKED catalog. Parent-facing only.
 * Rules: suggestions are chosen by interest topics a parent/student picks, NEVER targeted from grades or school records.
 * Paid/affiliate links are off unless AFFILIATE_LINKS_ENABLED=true, and every paid link carries a disclosure.
 * No family data is ever sent to course providers.
 */
export const TOPICS = ['Coding', 'Art & design', 'Music', 'Robotics', 'Writing', 'Languages', 'Science', 'Money skills'] as const;
export type Topic = (typeof TOPICS)[number];

export interface CourseIdea { id: string; title: string; topic: Topic; format: string; ages: string; cost: 'Free' | 'Paid'; provider: string; affiliateUrl?: string }

export const CATALOG: CourseIdea[] = [
  { id: 'c1', title: 'Make your first game with block coding', topic: 'Coding', format: 'Self-paced online', ages: '10–14', cost: 'Free', provider: 'Example Provider A (mock)' },
  { id: 'c2', title: 'Intro to Python, live small group', topic: 'Coding', format: 'Live online, 6 weeks', ages: '12–17', cost: 'Paid', provider: 'Example Provider B (mock)', affiliateUrl: 'https://example.com/aff/python' },
  { id: 'c3', title: 'Digital illustration basics', topic: 'Art & design', format: 'Self-paced online', ages: '11–17', cost: 'Paid', provider: 'Example Provider C (mock)', affiliateUrl: 'https://example.com/aff/art' },
  { id: 'c4', title: 'Beginner keyboard & music theory', topic: 'Music', format: 'Live online', ages: '8–14', cost: 'Paid', provider: 'Example Provider B (mock)', affiliateUrl: 'https://example.com/aff/music' },
  { id: 'c5', title: 'Build a line-following robot', topic: 'Robotics', format: 'Kit + video lessons', ages: '10–15', cost: 'Paid', provider: 'Example Provider D (mock)', affiliateUrl: 'https://example.com/aff/robot' },
  { id: 'c6', title: 'Creative writing club', topic: 'Writing', format: 'Local library (check yours)', ages: '9–17', cost: 'Free', provider: 'Your public library' },
  { id: 'c7', title: 'Conversational Spanish for teens', topic: 'Languages', format: 'Live online', ages: '13–17', cost: 'Paid', provider: 'Example Provider A (mock)', affiliateUrl: 'https://example.com/aff/spanish' },
  { id: 'c8', title: 'Backyard science experiments', topic: 'Science', format: 'Self-paced online', ages: '8–13', cost: 'Free', provider: 'Example Provider E (mock)' },
  { id: 'c9', title: 'Teen budgeting & first paycheck', topic: 'Money skills', format: 'Self-paced online', ages: '13–17', cost: 'Free', provider: 'Example Provider E (mock)' },
];

export const affiliateEnabled = () => process.env.AFFILIATE_LINKS_ENABLED === 'true';
