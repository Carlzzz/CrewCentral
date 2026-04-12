type Props = {
  logoUrl: string;
  slogan: string;
  versionLabel: string;
};

export default function HeroSection({ logoUrl, slogan, versionLabel }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Client logo"
          className="h-16 w-auto max-w-[240px] object-contain md:h-20"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-2xl font-semibold text-sky-600 md:h-20 md:w-20">
          CC
        </div>
      )}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{slogan}</h1>
        {versionLabel ? (
          <p className="text-sm text-slate-500">最新版本 {versionLabel}</p>
        ) : (
          <p className="text-sm text-slate-500">暂无公开发布</p>
        )}
      </div>
    </div>
  );
}
