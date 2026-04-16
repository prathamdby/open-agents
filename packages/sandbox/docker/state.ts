export interface DockerState {
  containerName: string;
  volumeName: string;
  ports: number[];
  hostPortMap: Record<number, number>;
}
