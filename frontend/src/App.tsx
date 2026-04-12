import { Navigate, Route, Routes } from "react-router-dom";
import AuthCancelledPage from "./pages/AuthCancelledPage";
import AuthSuccessPage from "./pages/AuthSuccessPage";
import ConsentPage from "./pages/ConsentPage";
import LoginPage from "./pages/LoginPage";
import DeviceManagePage from "./pages/admin/DeviceManagePage";
import SkillAssignmentPage from "./pages/admin/SkillAssignmentPage";
import SkillDiscoverPage from "./pages/admin/SkillDiscoverPage";
import SkillUploadPage from "./pages/admin/SkillUploadPage";
import ReleasePublishPage from "./pages/admin/ReleasePublishPage";
import DocsEditorPage from "./pages/admin/DocsEditorPage";
import AdminLayout from "./pages/admin/AdminLayout";
import DownloadLandingPage from "./pages/DownloadLandingPage";
import DocsReaderLayout from "./pages/DocsReaderLayout";
import DocsHomePage from "./pages/DocsHomePage";
import DocsPageView from "./pages/DocsPageView";
import DocsSearchPage from "./pages/DocsSearchPage";
import IndexRedirect from "./pages/IndexRedirect";
import HomePage from "./pages/HomePage";
import ProfilePage from "./pages/ProfilePage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import UserManagePage from "./pages/admin/UserManagePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<IndexRedirect />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/consent" element={<ConsentPage />} />
      <Route path="/success" element={<AuthSuccessPage />} />
      <Route path="/cancelled" element={<AuthCancelledPage />} />
      <Route path="/download" element={<DownloadLandingPage />} />
      <Route path="/me/profile" element={<ProfilePage />} />
      <Route path="/me/change-password" element={<ChangePasswordPage />} />
      <Route path="/docs" element={<DocsReaderLayout />}>
        <Route index element={<DocsHomePage />} />
        <Route path="search" element={<DocsSearchPage />} />
        <Route path=":slug" element={<DocsPageView />} />
      </Route>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/skills" replace />} />
        <Route path="devices" element={<DeviceManagePage />} />
        <Route path="skills" element={<SkillDiscoverPage />} />
        <Route path="skills/upload" element={<SkillUploadPage />} />
        <Route path="skills/assignments" element={<SkillAssignmentPage />} />
        <Route path="releases" element={<ReleasePublishPage />} />
        <Route path="docs" element={<DocsEditorPage />} />
        <Route path="users" element={<UserManagePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
