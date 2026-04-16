import { ProfileSection } from "../profile-section";

export default function ProfilePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Profile</h1>
      <div className="max-w-3xl">
        <ProfileSection />
      </div>
    </>
  );
}
