module.exports = {
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          provider: "github",
          private: true,
          owner: "appzap",
          name: "appzap-desktop-restaurant",
          repo: "appzap-desktop-restaurant",
          token:
            "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",
          token2: "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",
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};
