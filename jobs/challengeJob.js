const cron = require('node-cron');
const Challenge = require('../models/Challenge');
const Post = require('../models/Post');
const User = require('../models/User');
const { awardPoints } = require('../utils/forgeScore');

/**
 * Cierra los retos cuya endDate ha pasado y asigna el ganador.
 * Se ejecuta cada dia a las 00:05.
 */
const startChallengeJob = () => {
  cron.schedule('5 0 * * *', async () => {
    console.log('[ChallengeJob] Checking for expired challenges...');

    try {
      const now = new Date();
      const expiredChallenges = await Challenge.find({
        isActive: true,
        endDate: { $lt: now }
      });

      for (const challenge of expiredChallenges) {
        const posts = await Post.find({
          challengeId: challenge._id,
          privacy: 'public'
        });

        if (posts.length > 0) {
          const postsWithAvg = posts.map((post) => {
            const avg = post.ratings && post.ratings.length
              ? post.ratings.reduce((sum, r) => sum + r.value, 0) / post.ratings.length
              : 0;
            return { post, avg };
          });

          postsWithAvg.sort((a, b) => b.avg - a.avg);
          const winnerPost = postsWithAvg[0].post;
          const winnerId = winnerPost.userId;

          if (challenge.badge) {
            await User.findByIdAndUpdate(winnerId, {
              $addToSet: { badges: challenge.badge }
            });
          }

          await awardPoints(winnerId, 'WIN_CHALLENGE');

          await Challenge.findByIdAndUpdate(challenge._id, {
            isActive: false,
            winnerId,
            winnerPostId: winnerPost._id
          });

          console.log(`[ChallengeJob] Challenge "${challenge.title}" closed. Winner: ${winnerId}`);
        } else {
          await Challenge.findByIdAndUpdate(challenge._id, { isActive: false });
          console.log(`[ChallengeJob] Challenge "${challenge.title}" closed with no participants.`);
        }
      }
    } catch (err) {
      console.error('[ChallengeJob] Error:', err.message);
    }
  });

  console.log('[ChallengeJob] Scheduler started.');
};

module.exports = { startChallengeJob };
