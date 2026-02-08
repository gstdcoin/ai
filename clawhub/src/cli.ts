#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

const program = new Command();

program
    .name('clawhub')
    .description('Skill Registry for AI Agents')
    .version('1.0.0');

program
    .command('install')
    .description('Install a skill to the current project')
    .argument('[skill]', 'Name of the skill to install')
    .action(async (skillName) => {
        if (!skillName) {
            console.log(chalk.yellow('Usage: npx clawhub install <skill-name>'));
            return;
        }

        console.log(chalk.cyan(`🦞 ClawHub: Installing skill "${skillName}"...`));

        // Target directory: .agent/skills/<skillName>
        const targetDir = path.join(process.cwd(), '.agent', 'skills', skillName);

        // Simulate finding the skill in our registry
        // For now, we'll try to find it in the current machine's A2A/skills or use a mock
        const sourceDir = path.join('/home/ubuntu/A2A/skills', skillName);

        try {
            if (await fs.pathExists(sourceDir)) {
                await fs.ensureDir(targetDir);
                await fs.copy(sourceDir, targetDir);
                console.log(chalk.green(`✅ Skill "${skillName}" installed successfully to ${targetDir}`));
            } else if (skillName === 'gstd-a2a') {
                // Special case for the main skill
                const a2aSource = '/home/ubuntu/A2A';
                await fs.ensureDir(targetDir);
                // Copy SKILL.md and relevant files
                const filesToCopy = ['SKILL.md', 'main.py', 'requirements.txt', 'python-sdk'];
                for (const file of filesToCopy) {
                    const src = path.join(a2aSource, file);
                    const dest = path.join(targetDir, file);
                    if (await fs.pathExists(src)) {
                        await fs.copy(src, dest);
                    }
                }
                console.log(chalk.green(`✅ Skill "gstd-a2a" installed successfully to ${targetDir}`));
            } else {
                console.log(chalk.red(`❌ Error: Skill "${skillName}" not found in ClawHub registry.`));
                console.log(chalk.gray('Available skills: gstd-a2a, autonomous_commander'));
            }
        } catch (error: any) {
            console.log(chalk.red(`❌ Error during installation: ${error.message}`));
        }
    });

program
    .command('list')
    .description('List available skills in ClawHub')
    .action(() => {
        console.log(chalk.cyan('🦞 Available ClawHub Skills:'));
        console.log(' - ' + chalk.bold('gstd-a2a') + ': The primary A2A autonomous economy skill');
        console.log(' - ' + chalk.bold('autonomous_commander') + ': Advanced orchestration skill');
    });

program.parse(process.argv);
