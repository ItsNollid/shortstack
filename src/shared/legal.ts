// Bundled so the policy and terms are reachable from inside the app at any time, with no network
// and no browser, which is what the YouTube API Services Developer Policies require.
export const LEGAL_VERSION = '2026-09-12';

export interface LegalDocument {
  title: string;
  updated: string;
  sections: ReadonlyArray<{ heading: string; paragraphs: readonly string[] }>;
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'ShortStack Privacy Policy',
  updated: LEGAL_VERSION,
  sections: [
    {
      heading: 'What ShortStack is',
      paragraphs: [
        'ShortStack is a desktop application that you run on your own computer. It helps you queue, approve and schedule short videos for a YouTube channel you control.',
        'ShortStack uses YouTube API Services. By using it you also agree to the YouTube Terms of Service at https://www.youtube.com/t/terms, and Google’s Privacy Policy at https://policies.google.com/privacy applies to Google’s handling of your data.',
        'ShortStack is not affiliated with, endorsed by, or sponsored by YouTube or Google.'
      ]
    },
    {
      heading: 'What it accesses',
      paragraphs: [
        'With your permission, ShortStack asks Google for access to: uploading videos to your channel, reading your channel’s videos and details, changing videos it uploaded or that you linked to it, and reading your channel’s analytics.',
        'It reads the video files in the folder you choose, along with their names, sizes and durations.'
      ]
    },
    {
      heading: 'Where your data is kept',
      paragraphs: [
        'Everything ShortStack stores is kept on your computer: a local database file, your video details, your settings, and your Google sign-in tokens, which are encrypted using the operating system’s own secure storage.',
        'There is no ShortStack server. Your data is never sent to the developer or to any third party. The only services ShortStack contacts are Google’s YouTube APIs, and — only if you switch it on — an Ollama model running on your own computer.'
      ]
    },
    {
      heading: 'How long it is kept',
      paragraphs: [
        'Channel details and your channel picture are refreshed while ShortStack is connected. If they cannot be refreshed for 30 days, they are deleted.',
        'Your queue, settings and activity record stay on your computer until you delete them or uninstall the app.'
      ]
    },
    {
      heading: 'Removing your data',
      paragraphs: [
        'Settings, then Legal and data, has “Disconnect and delete YouTube data”. It revokes ShortStack’s access with Google straight away and deletes the stored tokens, channel details, channel picture and analytics from this computer.',
        'You can also remove ShortStack’s access at any time from the Google security settings page at https://myaccount.google.com/permissions. If you do, ShortStack deletes the same data the next time it runs, and within 30 days at the latest.'
      ]
    },
    {
      heading: 'Contact',
      paragraphs: ['Questions about this policy can be raised on the ShortStack project page.']
    }
  ]
};

export const TERMS: LegalDocument = {
  title: 'ShortStack Terms of Use',
  updated: LEGAL_VERSION,
  sections: [
    {
      heading: 'Using ShortStack',
      paragraphs: [
        'ShortStack is provided as-is, with no warranty. You use it at your own risk and remain responsible for everything published to your channel.',
        'By using ShortStack you agree to the YouTube Terms of Service at https://www.youtube.com/t/terms.'
      ]
    },
    {
      heading: 'What ShortStack will and will not do',
      paragraphs: [
        'No video is uploaded, scheduled or published without you approving it first. Approving shows you exactly what will happen before you agree.',
        'ShortStack does not change your videos’ details on YouTube except where you asked it to, and it never uploads a video it has already uploaded.',
        'If you turn on automatic approval, ShortStack acts on new files without asking. That setting is off unless you switch it on, and it explains what it does before you do.'
      ]
    },
    {
      heading: 'Your responsibilities',
      paragraphs: [
        'You are responsible for the content you publish and for complying with YouTube’s policies, including its rules on copyright, spam and deceptive practices.',
        'You supply your own Google Cloud credentials, and any API quota or audit requirements attached to them are yours to manage.'
      ]
    }
  ]
};
