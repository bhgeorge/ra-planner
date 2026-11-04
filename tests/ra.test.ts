import { describe, expect, it } from 'vitest';
import { buildRequestUrl, parseGameProgress } from '../src/lib/ra/api';

describe('parseGameProgress', () => {
  it('parses earned, hardcore, and unearned achievements', () => {
    const data = parseGameProgress(
      {
        Title: 'Test Game',
        ConsoleName: 'SNES',
        NumAchievements: 3,
        ImageIcon: '/Images/000001.png',
        Achievements: {
          '101': {
            ID: 101,
            Title: 'First',
            Description: 'Do the first thing.',
            Points: 5,
            BadgeName: '00101',
            DateEarned: '2024-01-02 03:04:05',
          },
          '102': {
            ID: 102,
            Title: 'Second',
            Description: 'Do the second thing.',
            Points: 10,
            BadgeName: '00102',
            DateEarnedHardcore: '2024-02-03 04:05:06',
          },
          '103': {
            ID: 103,
            Title: 'Third',
            Description: 'Do the third thing.',
            Points: 25,
            BadgeName: '00103',
          },
        },
      },
      42,
    );

    expect(data.gameId).toBe(42);
    expect(data.title).toBe('Test Game');
    expect(data.consoleName).toBe('SNES');
    expect(data.numAchievements).toBe(3);
    expect(data.numAwarded).toBe(2);
    expect(data.numAwardedHardcore).toBe(1);
    expect(data.imageIcon).toBe('https://media.retroachievements.org/Images/000001.png');

    expect(data.achievements['101'].earnedMode).toBe('softcore');
    expect(data.achievements['102'].earnedMode).toBe('hardcore');
    expect(data.achievements['103'].earned).toBe(false);
    expect(data.achievements['103'].earnedMode).toBeNull();
    expect(data.achievements['101'].badgeUrl).toBe(
      'https://media.retroachievements.org/Badge/00101.png',
    );
  });

  it('accepts an array-shaped Achievements field', () => {
    const data = parseGameProgress(
      {
        Title: 'Array Game',
        Achievements: [
          { ID: 1, Title: 'One', Points: '5' },
          { ID: 2, Title: 'Two', Points: 10, DateEarned: '2024-05-05 00:00:00' },
        ],
      },
      7,
    );

    expect(data.numAchievements).toBe(2);
    expect(data.numAwarded).toBe(1);
    expect(data.achievements['1'].points).toBe(5);
    expect(data.achievements['2'].earned).toBe(true);
  });

  it('handles missing optional fields without throwing', () => {
    const data = parseGameProgress({ Achievements: { '9': {} } }, 99);
    expect(data.title).toBe('Game 99');
    expect(data.consoleName).toBe('');
    expect(data.imageIcon).toBeNull();
    expect(data.numAchievements).toBe(1);
    expect(data.achievements['9'].title).toBe('Achievement 9');
    expect(data.achievements['9'].points).toBe(0);
    expect(data.achievements['9'].badgeUrl).toBeNull();
    expect(data.achievements['9'].earned).toBe(false);
  });

  it('treats zero dates as unearned', () => {
    const data = parseGameProgress(
      {
        Achievements: {
          '5': { ID: 5, Title: 'Zero date', DateEarned: '0000-00-00 00:00:00' },
        },
      },
      1,
    );
    expect(data.achievements['5'].earned).toBe(false);
    expect(data.achievements['5'].dateEarned).toBeNull();
  });

  it('accepts lowercase field names', () => {
    const data = parseGameProgress(
      {
        title: 'Lower',
        achievements: {
          '3': { id: 3, title: 'Lowercase', points: 3 },
        },
      },
      3,
    );
    expect(data.title).toBe('Lower');
    expect(data.achievements['3'].title).toBe('Lowercase');
  });
});

describe('buildRequestUrl', () => {
  it('builds a direct RA API URL with credentials as query params', () => {
    const url = new URL(
      buildRequestUrl({ username: 'player', apiKey: 'secret' }, 1234),
    );
    expect(url.origin).toBe('https://retroachievements.org');
    expect(url.pathname).toBe('/API/API_GetGameInfoAndUserProgress.php');
    expect(url.searchParams.get('u')).toBe('player');
    expect(url.searchParams.get('y')).toBe('secret');
    expect(url.searchParams.get('g')).toBe('1234');
  });

  it('forwards the same params through a configured proxy', () => {
    const url = new URL(
      buildRequestUrl(
        { username: 'player', apiKey: 'secret' },
        1234,
        'https://proxy.example.workers.dev/ra',
      ),
    );
    expect(url.origin).toBe('https://proxy.example.workers.dev');
    expect(url.pathname).toBe('/ra');
    expect(url.searchParams.get('g')).toBe('1234');
  });
});
