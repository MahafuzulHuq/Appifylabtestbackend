import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
 
const FIXED_IMAGES = [
  "/api/uploads/sample-post-0.jpg",
  "/api/uploads/sample-post-1.jpg",
  "/api/uploads/sample-post-2.jpg",
  "/api/uploads/sample-post-3.jpg",
  "/api/uploads/sample-post-4.jpg"
];
 
const FIXED_AVATARS = [
  "/api/uploads/avatar-0.jpg",
  "/api/uploads/avatar-1.jpg",
  "/api/uploads/avatar-2.jpg",
  "/api/uploads/avatar-3.jpg",
  "/api/uploads/avatar-4.jpg"
];
 
function generateFakeUser(index: number, sharedPasswordHash: string) { 
  const avatarIndex = (index - 1) % FIXED_AVATARS.length;

  return {
    firstName: `Admin_${index}`,
    lastName: `Last_${index}`,
    email: `admin${index}@gmail.com`, 
    passwordHash: sharedPasswordHash, 
    avatarUrl: FIXED_AVATARS[avatarIndex],  
  };
}
 
function generateFakePost(index: number, authorId: string) {
  const imageIndex = (index - 1) % FIXED_IMAGES.length; 

  return {
    authorId: authorId,
    content: `This is automated timeline feed content post number ${index.toLocaleString()}. #scaling #database`,
    imageUrl: FIXED_IMAGES[imageIndex], 
    visibility: index % 10 === 0 ? 'private' : 'public',
    createdAt: new Date(Date.now() - index * 60 * 1000), 
  };
}

async function main() {
  const globalStartTime = Date.now();
  
  const TARGET_USER_ID = "cmqb4304k00007j0s4q1srnb7";
  const MAIN_ADMIN_EMAIL = "admin@gmail.com";
  const ADMIN_PLAIN_PASSWORD = "123456";
  
  console.log("Pre-calculating secure master cryptographic hashes...");
  const sharedPasswordHash = await bcrypt.hash(ADMIN_PLAIN_PASSWORD, 10);
 
  console.log(`👤 Provisioning master administrator profile: [${MAIN_ADMIN_EMAIL}]...`);
  await prisma.user.upsert({
    where: { id: TARGET_USER_ID },
    update: {
      email: MAIN_ADMIN_EMAIL,
      passwordHash: sharedPasswordHash,
      avatarUrl: FIXED_AVATARS[0],  
    },
    create: {
      id: TARGET_USER_ID,
      firstName: "Admin",
      lastName: "Manager",
      email: MAIN_ADMIN_EMAIL,
      passwordHash: sharedPasswordHash,
      avatarUrl: FIXED_AVATARS[0],
    },
  });
  console.log('Master admin profile record established.');
 
  console.log("Initializing 3,000,000 auto-increment user records batch loop...");
  const TOTAL_USERS = 3_000_000;
  const USER_BATCH_SIZE = 5000; 
  let userBatch: Array<ReturnType<typeof generateFakeUser>> = [];
  const userStartTime = Date.now();

  for (let i = 1; i <= TOTAL_USERS; i++) {
    userBatch.push(generateFakeUser(i, sharedPasswordHash));

    if (userBatch.length === USER_BATCH_SIZE || i === TOTAL_USERS) {
      await prisma.user.createMany({
        data: userBatch,
        skipDuplicates: true,
      });

      if (i % 100000 === 0 || i === TOTAL_USERS) {
        const percent = ((i / TOTAL_USERS) * 100).toFixed(1);
        console.log(`👥 Users Generation: ${percent}% | Injected up to admin${i.toLocaleString()}@gmail.com...`);
      }
      userBatch = []; 
    }
  }
  console.log(`3M Users written in ${((Date.now() - userStartTime) / 1000).toFixed(2)} seconds.`);
 
  console.log("Initializing 1,000,000 posts generation script matching admin profile...");
  const TOTAL_POSTS = 1_000_000;
  const POST_BATCH_SIZE = 5000;
  let postBatch: Array<ReturnType<typeof generateFakePost>> = [];
  const postStartTime = Date.now();

  for (let i = 1; i <= TOTAL_POSTS; i++) {
    postBatch.push(generateFakePost(i, TARGET_USER_ID));

    if (postBatch.length === POST_BATCH_SIZE || i === TOTAL_POSTS) {
      await prisma.post.createMany({
        data: postBatch,
        skipDuplicates: false,
      });

      if (i % 100000 === 0 || i === TOTAL_POSTS) {
        const percent = ((i / TOTAL_POSTS) * 100).toFixed(1);
        console.log(`Posts Generation: ${percent}% | Injected ${i.toLocaleString()} / ${TOTAL_POSTS.toLocaleString()} rows...`);
      }
      postBatch = []; 
    }
  }
  console.log(`1M Posts written in ${((Date.now() - postStartTime) / 1000).toFixed(2)} seconds.`);

  const totalDuration = (Date.now() - globalStartTime) / 1000;
  console.log(`MASTER SEED INJECTION RUN COMPLETE!`);
  console.log(`Summary: 1 Main Admin + 3,000,000 Incremental Users + 1,000,000 Posts finished cleanly in ${totalDuration.toFixed(2)}s.`);
}

main()
  .catch((e) => {
    console.error('Critical runtime failure detected executing seed loop:');
    console.error(e instanceof Error ? e.stack : e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  