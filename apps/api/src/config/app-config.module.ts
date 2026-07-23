import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnvironment } from './environment';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: false,
      skipProcessEnv: true,
      validate: validateEnvironment
    })
  ],
  providers: [AppConfigService],
  exports: [AppConfigService]
})
export class AppConfigModule {}
