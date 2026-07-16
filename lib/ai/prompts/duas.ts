/**
 * lib/ai/prompts/duas.ts
 *
 * Reusable Library of Authentic Islamic Duas, Qur'anic Verses, and Ahadith
 * for the Daarayn Trust Intelligence Engine.
 */

export interface DuaReference {
  arabic?: string;
  translation: string;
  source?: string;
}

export const DUA_LIBRARY: Record<string, DuaReference[]> = {
  acknowledgement: [
    {
      arabic: "اللهم تقبل منهم واجعلها صدقة جارية وبارك لهم في أموالهم وأهليهم وارزقهم من واسع فضلك.",
      translation: "O Allah, accept this charity from them, make it a continuous charity for them, bless their wealth and families, and provide for them from Your immense bounty.",
    },
    {
      translation: "May Allah (SWT) accept your generosity, increase you in barakah, forgive your shortcomings, grant you goodness in this life and the next, and make this charity a means of shade for you on the Day of Judgment. Ameen.",
    },
    {
      arabic: "ربنا تقبل منا إنك أنت السميع العليم وتوب علينا إنك أنت التواب الرحيم.",
      translation: "Our Lord, accept [this] from us. Indeed, You are the Hearing, the Knowing. And accept our repentance. Indeed, You are the Accepting of repentance, the Merciful.",
      source: "Qur'an 2:127-128",
    }
  ],
  allocation: [
    {
      translation: "May Allah (SWT) reward you manifold for every dirham allocated, place barakah in the hands of those executing this work, and write this among your heavy scales on the Day of Account. Ameen.",
    },
    {
      translation: "May Allah (SWT) accept your contribution, make it a source of relief for the beneficiaries, and reward you with high ranks in Jannah for bringing ease to others. Ameen.",
    }
  ],
  projectUpdate: [
    {
      translation: "May Allah (SWT) accept your charity, grant steadfastness to the caretakers, and let you witness the fruits of your Sadaqah Jariyah in this life and the Hereafter. Ameen.",
    },
    {
      translation: "May Allah (SWT) bless your wealth, bring happiness to your home as you have brought ease to this community, and allow this verified work to witness for you on the Day of Judgment. Ameen.",
    }
  ],
  certificate: [
    {
      translation: "May Allah (SWT) record this contribution in your ledger of good deeds, protect your family, and make your generosity a means of ultimate success in the Hereafter. Ameen.",
    }
  ],
  annualReport: [
    {
      translation: "May Allah (SWT) reward you abundantly for a year of faithful support, accept every effort made in His cause, and bless your livelihood with barakah and ease. Ameen.",
    }
  ],
  ramadan: [
    {
      translation: "May Allah (SWT) allow us to reach Ramadan, accept our fasting, standing in prayer, and charity, and make our giving a means of freedom from the Fire. Ameen.",
    }
  ],
  emergency: [
    {
      translation: "May Allah (SWT) alleviate the suffering of our brothers and sisters, reward your swift response to their call, and make your charity a shield of protection for you and your loved ones. Ameen.",
    }
  ]
};

export const CHARITY_SCRIPTURES = [
  {
    text: "Indeed, those who give charity, men and women, and lend to Allah a goodly loan — it will be multiplied for them, and they will have a noble reward.",
    reference: "Qur'an 57:18"
  },
  {
    text: "The example of those who spend their wealth in the way of Allah is like a seed [of grain] which grows seven ears; in each ear is a hundred grains. And Allah multiplies [His reward] for whom He wills.",
    reference: "Qur'an 2:261"
  },
  {
    text: "Charity does not decrease wealth.",
    reference: "Hadith, Sahih Muslim 2588"
  },
  {
    text: "Save yourself from Hell-fire even by giving half a date-fruit in charity.",
    reference: "Hadith, Sahih al-Bukhari 1417"
  }
];
